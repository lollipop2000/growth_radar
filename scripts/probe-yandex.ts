import {
  metrikaApi,
  webmasterApi,
  object,
  id,
  text,
  safeError,
} from "../src/lib/yandex/api";
const counterId = process.env.YANDEX_METRIKA_COUNTER_ID;
try {
  if (!counterId || !/^\d+$/.test(counterId)) throw new Error("config");
  const counter = object(
    (await metrikaApi().json(`/management/v1/counter/${counterId}`)).counter,
  );
  const data = await metrikaApi().json(
    `/management/v1/counter/${counterId}/goals`,
  );
  console.log(
    JSON.stringify({
      source: "METRIKA",
      status: "PASS",
      counterId: id(counter.id),
      name: text(counter.name),
      site: counter.site,
      goals: (data.goals as unknown[]).map((v) => {
        const g = object(v);
        return { id: id(g.id), name: text(g.name), type: g.type };
      }),
    }),
  );
  const report = await metrikaApi().json(
    `/stat/v1/data?ids=${counterId}&date1=yesterday&date2=yesterday&dimensions=ym:s:date,ym:s:startURL&metrics=ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds&limit=1&accuracy=full`,
  );
  console.log(
    JSON.stringify({
      source: "METRIKA_REPORT",
      status: "PASS",
      rows: Array.isArray(report.data) ? report.data.length : null,
      totalRows: report.total_rows,
      query: report.query,
      sampled: report.sampled,
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({ source: "METRIKA", status: "ERROR", error: safeError(e) }),
  );
}
try {
  const userId = id((await webmasterApi().json("/v4/user")).user_id);
  const data = await webmasterApi().json(`/v4/user/${userId}/hosts`);
  console.log(
    JSON.stringify({
      source: "WEBMASTER",
      status: "PASS",
      userId,
      hosts: (data.hosts as unknown[]).map((v) => {
        const h = object(v);
        return {
          id: text(h.host_id),
          url: text(h.unicode_host_url),
          verified: h.verified,
        };
      }),
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({
      source: "WEBMASTER",
      status: "ERROR",
      error: safeError(e),
    }),
  );
}
