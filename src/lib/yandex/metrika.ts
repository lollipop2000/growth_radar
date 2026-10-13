import "server-only";
import { ApiError, YandexApi, object, text, id, number } from "./api";
import { day } from "./dates";
export type Goal = { id: string; name: string; type: string | null };
export type MetrikaRow = {
  date: string;
  url: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number | null;
  avgVisitDuration: number | null;
  goalConversionsJson: Record<string, number>;
  rawJson: Record<string, unknown>;
};
export const baseMetrics = [
  "ym:s:visits",
  "ym:s:users",
  "ym:s:pageviews",
  "ym:s:bounceRate",
  "ym:s:avgVisitDurationSeconds",
];
export function metrics(goals: string[]) {
  if (goals.length > 15 || goals.some((g) => !/^\d+$/.test(g)))
    throw new ApiError("API_ERROR");
  return [...baseMetrics, ...goals.map((g) => `ym:s:goal${g}reaches`)];
}
export async function inspectCounter(api: YandexApi, counterId: string) {
  if (!/^\d+$/.test(counterId)) throw new ApiError("NOT_CONFIGURED");
  const c = object(
    (await api.json(`/management/v1/counter/${counterId}`)).counter,
  );
  if (id(c.id) !== counterId) throw new ApiError("COUNTER_NOT_ACCESSIBLE");
  const data = await api.json(`/management/v1/counter/${counterId}/goals`);
  if (!Array.isArray(data.goals)) throw new ApiError("MALFORMED_RESPONSE");
  const goals: Goal[] = data.goals.map((v) => {
    const g = object(v);
    return {
      id: id(g.id),
      name: text(g.name),
      type: typeof g.type === "string" ? g.type : null,
    };
  });
  return {
    counterId,
    name: text(c.name),
    site: typeof c.site === "string" ? c.site : null,
    timeZone: typeof c.time_zone_name === "string" ? c.time_zone_name : null,
    goals,
  };
}
export function parseReport(
  data: Record<string, unknown>,
  goals: string[],
  expectedDate?: string,
) {
  const q = object(data.query);
  if (
    !Array.isArray(q.metrics) ||
    JSON.stringify(q.metrics) !== JSON.stringify(metrics(goals)) ||
    !Array.isArray(q.dimensions) ||
    JSON.stringify(q.dimensions) !==
      JSON.stringify(["ym:s:date", "ym:s:startURL"]) ||
    !Array.isArray(data.data)
  )
    throw new ApiError("MALFORMED_RESPONSE");
  const rows: MetrikaRow[] = data.data.map((v) => {
    const row = object(v);
    if (
      !Array.isArray(row.dimensions) ||
      row.dimensions.length !== 2 ||
      !Array.isArray(row.metrics) ||
      row.metrics.length !== metrics(goals).length
    )
      throw new ApiError("MALFORMED_RESPONSE");
    const date = text(object(row.dimensions[0]).name);
    try {
      day(date);
    } catch {
      throw new ApiError("MALFORMED_RESPONSE");
    }
    if (expectedDate && date !== expectedDate)
      throw new ApiError("MALFORMED_RESPONSE");
    const url = text(object(row.dimensions[1]).name),
      m = row.metrics;
    const nullable = (n: unknown) => (n === null ? null : number(n));
    return {
      date,
      url,
      visits: number(m[0]),
      visitors: number(m[1]),
      pageviews: number(m[2]),
      bounceRate: nullable(m[3]),
      avgVisitDuration: nullable(m[4]),
      goalConversionsJson: Object.fromEntries(
        goals.map((g, i) => [g, number(m[i + 5])]),
      ),
      rawJson: { dimensions: row.dimensions, metrics: m },
    };
  });
  const total = number(data.total_rows);
  if (!Number.isInteger(total)) throw new ApiError("MALFORMED_RESPONSE");
  return {
    rows,
    total,
    meta: {
      dimensions: q.dimensions,
      metrics: q.metrics,
      accuracy: q.accuracy ?? "full",
      sampled: data.sampled ?? false,
      sampleShare: data.sample_share ?? null,
      containsSensitiveData: data.contains_sensitive_data ?? false,
      granularity: "LANDING_PAGE_SESSION",
    },
  };
}
export async function reportPage(
  api: YandexApi,
  counterId: string,
  date: string,
  goals: string[],
  offset = 1,
  limit = 1000,
) {
  const query = new URLSearchParams({
    ids: counterId,
    date1: date,
    date2: date,
    dimensions: "ym:s:date,ym:s:startURL",
    metrics: metrics(goals).join(","),
    accuracy: "full",
    limit: String(limit),
    offset: String(offset),
    sort: "ym:s:startURL",
  });
  const response = await api.json("/stat/v1/data?" + query);
  const q = object(response.query);
  if (Array.isArray(q.ids) && !q.ids.some((v) => String(v) === counterId))
    throw new ApiError("COUNTER_NOT_ACCESSIBLE");
  return parseReport(response, goals, date);
}
