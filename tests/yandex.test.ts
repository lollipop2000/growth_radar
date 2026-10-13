import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  YandexApi,
  safeError,
  readBounded,
} from "../src/lib/yandex/api";
import {
  metrics,
  parseReport,
  inspectCounter,
  reportPage,
} from "../src/lib/yandex/metrika";
import {
  inspectWebmaster,
  parseExport,
  submitExport,
  exportStatus,
  downloadExport,
  downloadExportResult,
  decodeExport,
  discoverUrlPage,
} from "../src/lib/yandex/webmaster";
import { gzipSync } from "node:zlib";
import { createYandexFetch } from "../src/lib/yandex/transport";
import { matchUrl } from "../src/lib/yandex/matching";
import { searchTotals, metrikaTotals } from "../src/lib/yandex/views";
import {
  day,
  days,
  nextMoscowDay,
  period,
  yesterday,
} from "../src/lib/yandex/dates";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
test("Export browser download handles network failure, never retries HTTP 403 or a foreign destination", async () => {
  let downloads = 0;
  const browser = async () => { downloads++; return gzipSync("date;url;query\n"); };
  const url = "https://storage.mds.yandex.net/get-webmaster-download/task.csv.gz";
  const result = await downloadExportResult(url, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch, browser);
  assert.equal(result.transport, "BROWSER"); assert.equal(result.csv, "date;url;query\n");
  await assert.rejects(downloadExportResult(url, (async () => new Response("challenge", { status: 403 })) as typeof fetch, browser), ApiError);
  await assert.rejects(downloadExportResult("https://evil.example/file", undefined, browser), ApiError);
  assert.equal(downloads, 1);
});
test("Yandex TLS fallback only retries an unopened GET connection, never HTTP 403 or an uncertain POST", async () => {
  let normalCalls = 0, compatibleCalls = 0;
  const timeout = () => new TypeError("fixture-secret", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
  const f = createYandexFetch((async () => { normalCalls++; throw timeout(); }) as typeof fetch,
    (async (_input, init) => { compatibleCalls++; assert.equal(init?.redirect, "error"); return json({ ok: true }); }) as typeof fetch);
  const options = { redirect: "error" as const, signal: AbortSignal.timeout(1000) };
  await assert.rejects(f("https://api.webmaster.yandex.net/", { ...options, method: "POST" }));
  assert.equal(compatibleCalls, 0);
  await f("https://api.webmaster.yandex.net/", options);
  await f("https://api.webmaster.yandex.net/", { ...options, method: "POST" });
  assert.equal(normalCalls, 2); assert.equal(compatibleCalls, 2);
  const denied = createYandexFetch((async () => new Response("", { status: 403 })) as typeof fetch,
    (async () => { throw Error("must not run"); }) as typeof fetch);
  assert.equal((await denied("https://api-metrika.yandex.net/", options)).status, 403);
  await assert.rejects(f("https://evil.example/", options));
});
test("Yandex client redacts errors, rejects foreign origin, retries rate limits, and does not retry export creation", async () => {
  let calls = 0;
  const pauses: number[] = [];
  const fetcher = (async (input, init) => {
    assert.equal(
      new URL(String(input)).origin,
      "https://api-metrika.yandex.net",
    );
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "OAuth fixture-secret",
    );
    return ++calls < 3
      ? json({ message: "fixture-secret" }, 429)
      : json({ ok: true });
  }) as typeof fetch;
  const api = new YandexApi(
    "https://api-metrika.yandex.net",
    "fixture-secret",
    fetcher,
    async (ms) => {
      pauses.push(ms);
    },
  );
  assert.deepEqual(await api.json("/stat/v1/data"), { ok: true });
  assert.deepEqual(pauses, [1000, 2000]);
  assert.equal(calls, 3);
  await assert.rejects(api.json("https://malicious.example/"), ApiError);
  for (const [status, code] of [
    [401, "INVALID_TOKEN"],
    [403, "FORBIDDEN"],
    [404, "COUNTER_NOT_ACCESSIBLE"],
  ] as const) {
    const denied = new YandexApi(
      "https://api-metrika.yandex.net",
      "fixture-secret",
      (async () => new Response("fixture-secret", { status })) as typeof fetch,
    );
    await assert.rejects(
      denied.json("/"),
      (e: unknown) =>
        e instanceof ApiError &&
        e.code === code &&
        !safeError(e).includes("fixture-secret"),
    );
  }
  let exports = 0;
  const exportApi = new YandexApi(
    "https://api.webmaster.yandex.net",
    "fixture-secret",
    (async () => {
      exports++;
      return json({ message: "secret" }, 500);
    }) as typeof fetch,
    async () => {},
  );
  await assert.rejects(
    submitExport(exportApi, "/v4/user/1/hosts/x", ["2026-10-01"], "/"),
  );
  assert.equal(exports, 1);
  let networkCalls = 0;
  const networkApi = new YandexApi("https://api-metrika.yandex.net", "fixture-secret",
    (async () => { if (++networkCalls < 3) throw new TypeError("fetch failed"); return json({ ok: true }); }) as typeof fetch,
    async () => {});
  assert.deepEqual(await networkApi.json("/stat/v1/data"), { ok: true });
  assert.equal(networkCalls, 3);
  const failed = new YandexApi(
    "https://api-metrika.yandex.net",
    "fixture-secret",
    (async () => {
      throw new Error("fixture-secret stacktrace");
    }) as typeof fetch,
  );
  await assert.rejects(
    failed.json("/"),
    (e: unknown) => !safeError(e).includes("fixture-secret"),
  );
  await assert.rejects(readBounded(new Response("12345"), 4), ApiError);
});
test("Metrika official management and landing-page report contract validates metadata and pagination", async () => {
  const requests: URL[] = [];
  const api = new YandexApi(
    "https://api-metrika.yandex.net",
    "fixture",
    (async (input) => {
      const u = new URL(String(input));
      requests.push(u);
      if (u.pathname.endsWith("/goals"))
        return json({ goals: [{ id: 7, name: "Purchase", type: "action" }] });
      if (u.pathname.startsWith("/management"))
        return json({
          counter: {
            id: 123,
            name: "Shop",
            site: "https://example.com",
            time_zone_name: "Europe/Moscow",
          },
        });
      return json({
        query: {
          metrics: metrics(["7"]),
          dimensions: ["ym:s:date", "ym:s:startURL"],
        },
        total_rows: 2,
        sampled: true,
        sample_share: 0.5,
        data: [
          {
            dimensions: [
              { name: "2026-10-01" },
              { name: "https://example.com/?utm_source=a" },
            ],
            metrics: [12, 10, 30, 25, 60, 3],
          },
        ],
      });
    }) as typeof fetch,
  );
  const info = await inspectCounter(api, "123");
  assert.equal(info.counterId, "123");
  assert.equal(info.goals[0].id, "7");
  const result = await reportPage(api, "123", "2026-10-01", ["7"], 1001);
  assert.equal(result.total, 2);
  assert.equal(result.rows[0].goalConversionsJson["7"], 3);
  assert.equal(result.rows[0].url, "https://example.com/?utm_source=a");
  assert.equal(result.meta.sampled, true);
  assert.equal(result.meta.granularity, "LANDING_PAGE_SESSION");
  assert.equal(requests.at(-1)?.searchParams.get("offset"), "1001");
  assert.throws(
    () =>
      parseReport(
        { query: { metrics: [], dimensions: [] }, data: [], total_rows: 0 },
        [],
      ),
    ApiError,
  );
  assert.throws(
    () =>
      parseReport(
        {
          query: {
            metrics: metrics([]),
            dimensions: ["ym:s:date", "ym:s:startURL"],
          },
          data: [
            {
              dimensions: [{ name: "invalid" }, { name: "/" }],
              metrics: [1, 1, 1, 1, 1],
            },
          ],
          total_rows: 1,
        },
        [],
      ),
    ApiError,
  );
});
test("Webmaster discovers user/hosts, paginates URL discovery and follows task status without OAuth on download", async () => {
  let count = 0;
  const api = new YandexApi(
    "https://api.webmaster.yandex.net",
    "fixture",
    (async (input, init) => {
      const u = new URL(String(input));
      if (u.pathname === "/v4/user") return json({ user_id: 123 });
      if (u.pathname.endsWith("/hosts"))
        return json({
          hosts: [
            {
              host_id: "https:example.com:443",
              unicode_host_url: "https://example.com/",
              verified: true,
            },
          ],
        });
      if (u.pathname.endsWith("/list")) {
        const b = JSON.parse(String(init?.body));
        assert.equal(b.offset, 500);
        return json({
          count: 501,
          text_indicator_to_statistics: [
            { text_indicator: { type: "URL", value: "https://example.com/a" } },
          ],
        });
      }
      return json(
        ++count === 1
          ? { download_status: "IN_PROGRESS" }
          : {
              download_status: "SUCCESS",
              url: "https://storage.mds.yandex.net/get-webmaster-download/task",
            },
      );
    }) as typeof fetch,
  );
  const info = await inspectWebmaster(api);
  assert.equal(info.userId, "123");
  assert.equal(info.hosts[0].verified, true);
  const page = await discoverUrlPage(api, "/v4/user/123/hosts/x", 500);
  assert.equal(page.total, 501);
  assert.equal(page.urls.length, 1);
  assert.equal(
    (await exportStatus(api, "/v4/user/123/hosts/x", "task")).status,
    "IN_PROGRESS",
  );
  assert.equal(
    (await exportStatus(api, "/v4/user/123/hosts/x", "task")).status,
    "SUCCESS",
  );
  await assert.rejects(downloadExport("https://evil.example/data"), ApiError);
  const csv = await downloadExport(
    "https://storage.mds.yandex.net/get-webmaster-download/task",
    (async (_u, init) => {
      assert.equal(init?.headers, undefined);
      assert.equal(init?.redirect, "error");
      return new Response("csv");
    }) as typeof fetch,
  );
  assert.equal(csv, "csv");
  const compressed = await downloadExport(
    "https://storage.mds.yandex.net/get-webmaster-download/task.csv.gz",
    (async () => new Response(new Uint8Array(gzipSync("date;url;query\n")))) as typeof fetch,
  );
  assert.equal(compressed, "date;url;query\n");
  assert.throws(() => decodeExport(new Uint8Array([0x1f, 0x8b, 0])), ApiError);
});
test("Webmaster CSV preserves raw URL/query/region, derives CTR, rejects corrupt schema and out-of-task dates", () => {
  const csv =
    "date;host;url;query;region_id;clicks;impressions;position\n2026-10-01;example.com;/catalog/?utm_source=x;масло;225;5;100;4.5\n";
  const rows = parseExport(csv, "https://example.com/", ["2026-10-01"]);
  assert.equal(rows[0].url, "https://example.com/catalog/?utm_source=x");
  assert.equal(rows[0].region, "225");
  assert.equal(rows[0].ctr, 5);
  assert.equal(rows[0].rawJson.query, "масло");
  const yandexCsv = [
    '"date","host","path","query","regionId","regionName","clicks","impressions","position"',
    String.raw`"2026-10-01","https://example.com","/","масло \"премиум\"","225","Россия","5","100","4.5"`,
  ].join("\n");
  assert.equal(parseExport(yandexCsv, "https://example.com/", ["2026-10-01"], "/")[0].query, 'масло "премиум"');
  assert.throws(
    () => parseExport(csv, "https://example.com/", ["2026-10-02"]),
    ApiError,
  );
  assert.throws(
    () =>
      parseExport("URL,Clicks\n/,2", "https://example.com/", ["2026-10-01"]),
    ApiError,
  );
  assert.throws(
    () => parseExport(csv, "https://example.com/", ["2026-10-01"], "/other"),
    ApiError,
  );
});
test("Matching reuses scanner identity, matches observed redirect aliases and preserves meaningful params/unmatched rows", () => {
  const pages = [
    {
      id: "a",
      normalizedUrl: "https://example.com/catalog",
      aliasesJson: ["https://example.com/old"],
    },
  ];
  assert.equal(
    matchUrl(
      "https://example.com/catalog/?utm_source=x#h",
      "https://example.com/",
      pages,
    ).pageId,
    "a",
  );
  assert.equal(
    matchUrl("/old", "https://example.com/", pages).matchReason,
    "observed redirect alias",
  );
  assert.equal(
    matchUrl("/catalog?size=2", "https://example.com/", pages).matchReason,
    "query parameters",
  );
  assert.equal(
    matchUrl("https://other.com/catalog", "https://example.com/", pages)
      .matchReason,
    "different host",
  );
  assert.equal(
    matchUrl("/missing", "https://example.com/", pages).matchReason,
    "page not scanned",
  );
  assert.equal(
    matchUrl("/CATALOG", "https://example.com/", pages).matchReason,
    "normalization mismatch",
  );
  assert.equal(
    matchUrl("javascript:alert(1)", "https://example.com/", pages).matchReason,
    "unknown",
  );
});
test("Aggregation is weighted and transparent about daily visitors and missing goals; dates exclude today", () => {
  assert.deepEqual(
    searchTotals([
      { impressions: 100, clicks: 5, avgPosition: 2 },
      { impressions: 300, clicks: 15, avgPosition: 6 },
    ]),
    { impressions: 400, clicks: 20, ctr: 5, avgPosition: 5 },
  );
  const t = metrikaTotals(
    [
      {
        visits: 10,
        visitors: 8,
        pageviews: 20,
        bounceRate: 10,
        avgVisitDuration: 100,
        goalConversionsJson: { "7": 2 },
      },
      {
        visits: 30,
        visitors: 20,
        pageviews: 60,
        bounceRate: 50,
        avgVisitDuration: 20,
        goalConversionsJson: {},
      },
    ],
    ["7"],
  );
  assert.equal(t.bounceRate, 40);
  assert.equal(t.avgVisitDuration, 40);
  assert.equal(t.visitors, 28);
  assert.equal(t.goals["7"], null);
  assert.equal(yesterday(new Date("2026-10-05T01:00:00Z")), "2026-10-04");
  assert.equal(
    nextMoscowDay(new Date("2026-10-05T01:00:00Z")).toISOString(),
    "2026-10-05T21:05:00.000Z",
  );
  assert.equal(days("2026-09-28", "2026-10-04").length, 7);
  assert.equal(period(90, new Date("2026-10-05T01:00:00Z")).from, "2026-07-07");
  assert.throws(() => day("2026-02-30"));
});
