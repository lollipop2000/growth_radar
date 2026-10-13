import "server-only";
import { parse } from "csv-parse/sync";
import { gunzipSync } from "node:zlib";
import {
  YandexApi,
  ApiError,
  object,
  text,
  id,
  number,
  readBoundedBytes,
} from "./api";
import { day } from "./dates";
import { yandexFetch } from "./transport";
import { browserDownloadExport } from "./browser-download";
export type Host = { id: string; url: string; verified: boolean };
export type WebmasterRow = {
  date: string;
  url: string;
  query: string;
  region: string | null;
  impressions: number;
  clicks: number;
  avgPosition: number | null;
  ctr: number | null;
  rawJson: Record<string, string>;
};
export async function inspectWebmaster(api: YandexApi) {
  const userId = id((await api.json("/v4/user")).user_id),
    data = await api.json(`/v4/user/${userId}/hosts`);
  if (!Array.isArray(data.hosts)) throw new ApiError("MALFORMED_RESPONSE");
  const hosts: Host[] = data.hosts.map((v) => {
    const h = object(v);
    return {
      id: text(h.host_id),
      url: text(h.unicode_host_url),
      verified: h.verified === true,
    };
  });
  return { userId, hosts };
}
export function hostPath(userId: string, hostId: string) {
  if (!/^\d+$/.test(userId) || !hostId) throw new ApiError("NOT_CONFIGURED");
  return `/v4/user/${userId}/hosts/${encodeURIComponent(hostId)}`;
}
export async function discoverUrlPage(
  api: YandexApi,
  path: string,
  offset: number,
) {
  const result = await api.json(path + "/query-analytics/list", {
    offset,
    limit: 500,
    text_indicator: "URL",
    device_type_indicator: "ALL",
    search_location: "WEB_LOCATION",
  });
  if (!Array.isArray(result.text_indicator_to_statistics))
    throw new ApiError("MALFORMED_RESPONSE");
  const urls = result.text_indicator_to_statistics.map((v) => {
    const indicator = object(object(v).text_indicator);
    if (indicator.type !== "URL") throw new ApiError("MALFORMED_RESPONSE");
    return text(indicator.value);
  });
  return { urls, total: number(result.count) };
}
export async function availableDates(api: YandexApi, path: string) {
  const data = await api.json(path + "/pro/serp/dates");
  if (!Array.isArray(data.dates)) throw new ApiError("MALFORMED_RESPONSE");
  return data.dates.map((v) => {
    const d = text(v);
    try {
      day(d);
    } catch {
      throw new ApiError("MALFORMED_RESPONSE");
    }
    return d;
  });
}
export async function submitExport(
  api: YandexApi,
  path: string,
  dates: string[],
  exportPath: string,
) {
  const response = await api.json(
    path + "/pro/serp/queries/download/",
    { dates, paths: [exportPath], region_ids: [], use_pro_tariff: "false" },
    false,
  );
  return {
    taskId: text(response.task_id),
    remaining: number(response.free_quota_remaining),
    quotaUsed: number(response.total_quota_used),
  };
}
export async function exportStatus(
  api: YandexApi,
  path: string,
  taskId: string,
) {
  const data = await api.json(
    path + "/pro/serp/queries/download/" + encodeURIComponent(taskId),
  );
  const status = text(data.download_status);
  if (!["SUCCESS", "IN_PROGRESS", "FAILED"].includes(status))
    throw new ApiError("MALFORMED_RESPONSE");
  return { status, url: status === "SUCCESS" ? text(data.url) : null };
}
export async function downloadExport(
  url: string,
  fetcher: typeof fetch = yandexFetch,
) {
  return (await downloadExportResult(url, fetcher)).csv;
}
export async function downloadExportResult(
  url: string,
  fetcher: typeof fetch = yandexFetch,
  browserDownloader: (url: string) => Promise<Uint8Array> = browserDownloadExport,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "storage.mds.yandex.net" ||
    u.username ||
    u.password ||
    !u.pathname.startsWith("/get-webmaster-download/")
  )
    throw new ApiError("MALFORMED_RESPONSE");
  let response: Response;
  try {
    response = await fetcher(u, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch {
    return { csv: decodeExport(await browserDownloader(u.href)), transport: "BROWSER" as const };
  }
  if (!response.ok) throw new ApiError("API_ERROR", response.status);
  const bytes = await readBoundedBytes(response, 50 * 1024 * 1024);
  return { csv: decodeExport(bytes), transport: "HTTP" as const };
}
export function decodeExport(bytes: Uint8Array): string {
  try {
    // Content-Encoding gzip may already be decoded by fetch. Check bytes,
    // rather than the .gz suffix, and bound the decompressed output too.
    const data = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes, { maxOutputLength: 50 * 1024 * 1024 })
      : Buffer.from(bytes);
    if (data.length > 50 * 1024 * 1024) throw new Error("size");
    return data.toString("utf8");
  } catch {
    throw new ApiError("MALFORMED_RESPONSE");
  }
}
const aliases: Record<string, string> = {
  date: "date",
  дата: "date",
  url: "url",
  path: "url",
  страница: "url",
  адрес: "url",
  query: "query",
  запрос: "query",
  region: "region",
  regionid: "region",
  регион: "region",
  clicks: "clicks",
  клики: "clicks",
  impressions: "impressions",
  shows: "impressions",
  показы: "impressions",
  position: "position",
  avgposition: "position",
  позиция: "position",
  средняяпозиция: "position",
  host: "host",
  хост: "host",
  ctr: "ctr",
};
export function parseExport(
  csv: string,
  hostUrl: string,
  expectedDates: string[],
  expectedPath?: string,
): WebmasterRow[] {
  const header = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const delimiter = header.includes("\t")
    ? "\t"
    : header.includes(";")
      ? ";"
      : ",";
  let headers: string[] = [];
  let records: Record<string, string>[];
  const parseRows = (escape = '"'): Record<string, string>[] => parse(csv, {
      bom: true,
      delimiter,
      escape,
      skip_empty_lines: true,
      max_record_size: 100000,
      columns: (values: string[]) => {
        headers = values.map(
          (v) => aliases[v.toLowerCase().replace(/[\s_\-]/g, "")] ?? v,
        );
        if (new Set(headers).size !== headers.length)
          throw new Error("headers");
        return headers;
      },
    });
  try {
    records = parseRows();
  } catch {
    // The observed Yandex export uses backslash-escaped quotes in queries.
    // Keep strict CSV column/quote validation; do not enable relax_quotes.
    if (!/"regionName"/.test(header) || !/"path"/.test(header) || !csv.includes('\\"'))
      throw new ApiError("MALFORMED_RESPONSE");
    try { records = parseRows("\\"); }
    catch { throw new ApiError("MALFORMED_RESPONSE"); }
  }
  if (
    !["date", "url", "query", "impressions", "clicks", "position"].every((v) =>
      headers.includes(v),
    ) ||
    records.length > 200000
  )
    throw new ApiError("MALFORMED_RESPONSE");
  const numeric = (value: string) => {
    if (!value.trim()) throw new ApiError("MALFORMED_RESPONSE");
    const n = Number(value.replace(",", "."));
    return number(n);
  };
  return records.map((r) => {
    try {
      day(r.date);
    } catch {
      throw new ApiError("MALFORMED_RESPONSE");
    }
    if (
      !expectedDates.includes(r.date) ||
      !r.query ||
      r.query.length > 10000 ||
      !r.url
    )
      throw new ApiError("MALFORMED_RESPONSE");
    const base = r.host
      ? /^(?:https?:\/\/)/.test(r.host)
        ? r.host
        : new URL(hostUrl).protocol + "//" + r.host
      : hostUrl;
    let url: string;
    try {
      url = new URL(r.url, base).href;
    } catch {
      throw new ApiError("MALFORMED_RESPONSE");
    }
    if (
      expectedPath &&
      new URL(url).pathname + new URL(url).search !== expectedPath
    )
      throw new ApiError("MALFORMED_RESPONSE");
    const impressions = numeric(r.impressions),
      clicks = numeric(r.clicks),
      avgPosition = r.position?.trim() ? numeric(r.position) : null;
    return {
      date: r.date,
      url,
      query: r.query,
      region: r.region?.trim() || null,
      impressions,
      clicks,
      avgPosition,
      ctr: r.ctr?.trim()
        ? numeric(r.ctr)
        : impressions
          ? (clicks / impressions) * 100
          : null,
      rawJson: r,
    };
  });
}
