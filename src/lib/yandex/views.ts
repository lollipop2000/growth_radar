import "server-only";
import { db } from "../db";
import { currentSite, readIntegration, config, type Source } from "./settings";
import { day, period } from "./dates";
import { goalConfig, reportGoalIds } from "./goal-types";
import {searchDataset} from '../search/dataset';
export function selectedPeriod(raw?: string) {
  const n = Number(raw);
  return [7, 30, 90].includes(n) ? n : 30;
}
export function searchTotals(
  rows: { impressions: number; clicks: number; avgPosition: number | null }[],
) {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0),
    clicks = rows.reduce((s, r) => s + r.clicks, 0),
    known = rows.filter((r) => r.avgPosition !== null),
    weight = known.reduce((s, r) => s + r.impressions, 0);
  return {
    impressions,
    clicks,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    avgPosition: weight
      ? known.reduce((s, r) => s + r.impressions * r.avgPosition!, 0) / weight
      : null,
  };
}
export function metrikaTotals(
  rows: {
    visits: number;
    visitors: number;
    pageviews: number;
    bounceRate: number | null;
    avgVisitDuration: number | null;
    goalConversionsJson: unknown;
  }[],
  goals: string[] = [],
) {
  const visits = rows.reduce((s, r) => s + r.visits, 0);
  const weighted = (key: "bounceRate" | "avgVisitDuration") => {
    const known = rows.filter((r) => r[key] !== null),
      weight = known.reduce((s, r) => s + r.visits, 0);
    return weight
      ? known.reduce((s, r) => s + r[key]! * r.visits, 0) / weight
      : null;
  };
  return {
    visits,
    visitors: rows.reduce((s, r) => s + r.visitors, 0),
    pageviews: rows.reduce((s, r) => s + r.pageviews, 0),
    bounceRate: weighted("bounceRate"),
    avgVisitDuration: weighted("avgVisitDuration"),
    goals: Object.fromEntries(
      goals.map((id) => {
        const values = rows.map(
          (r) => (r.goalConversionsJson as Record<string, number>)[id],
        );
        return [
          id,
          rows.length && values.every((v) => typeof v === "number")
            ? values.reduce((s, v) => s + v, 0)
            : null,
        ];
      }),
    ),
  };
}
export function groupBy<T>(rows: T[], key: (v: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = m.get(k);
    if (group) group.push(row);
    else m.set(k, [row]);
  }
  return m;
}
export async function dataForSite(n: number, pageId?: string) {
  const activeSite = await currentSite(),
    dates = period(n),
    page = pageId
      ? await db.page.findUniqueOrThrow({
          where: { id: pageId },
          include: { site: true },
        })
      : null,
    site = page?.site ?? activeSite,
    historical = site.id !== activeSite.id;
  let m = config((await readIntegration("METRIKA"))?.configJson),
    w = config((await readIntegration("WEBMASTER"))?.configJson);
  if (historical) {
    const [mJob, wJob] = await Promise.all(
      ["METRIKA", "WEBMASTER"].map((source) =>
        db.jobRun.findFirst({
          where: { siteId: site.id, source, rowsSaved: { gt: 0 } },
          orderBy: { createdAt: "desc" },
        }),
      ),
    );
    m = { ...config(mJob?.configJson), siteId: site.id };
    w = { ...config(wJob?.configJson), siteId: site.id };
  }
  const where = {
    siteId: site.id,
    date: { gte: day(dates.from), lte: day(dates.to) },
    ...(pageId ? { pageId } : {}),
  };
  const [metrika, webmaster] = await Promise.all([
    m.siteId === site.id &&
    m.counterId &&
    (historical || m.counterId === process.env.YANDEX_METRIKA_COUNTER_ID)
      ? db.metrikaPageDaily.findMany({
          where: { ...where, counterId: m.counterId },
          orderBy: { date: "asc" },
        })
      : [],
    searchDataset(where,w.siteId === site.id ? w.hostId : undefined),
  ]);
  return {
    site,
    dates,
    metrika,
    webmaster,
    goals: reportGoalIds(m),
    goalConfig: goalConfig(m.siteId===site.id?m:{}),
    goalNames: m.goals ?? [],
    historical,
    counterId: m.counterId,
    hostId: w.hostId,
  };
}
export async function freshness() {
  const site = await currentSite(),
    scan = await db.scan.findFirst({
      select:{finishedAt:true},
      where: { siteId: site.id, status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
    }),
    active = await db.scan.findFirst({
      select:{id:true},
      where: {
        siteId: site.id,
        status: { in: ["PENDING", "RUNNING", "STOPPING"] },
      },
    }),
    latest = await db.scan.findFirst({
      select:{status:true,lastError:true},
      where: { siteId: site.id },
      orderBy: { startedAt: "desc" },
    });
  const rows = [
    {
      source: "Site Scan",
      status: active
        ? "SYNCING"
        : latest &&
            [
              "FAILED",
              "BLOCKED_BY_WAF",
              "AUTH_REQUIRED",
              "INTERRUPTED",
            ].includes(latest.status)
          ? "ERROR"
          : scan
            ? "HEALTHY"
            : "WARNING",
      lastSuccess: scan?.finishedAt ?? null,
      error: latest?.lastError ?? null,
      nextRun: null as string | null,
    },
  ];
  for (const source of ["WEBMASTER", "METRIKA"] as Source[]) {
    const row = await readIntegration(source),
      c = config(row?.configJson),
      token =
        source === "METRIKA"
          ? process.env.YANDEX_METRIKA_TOKEN &&
            process.env.YANDEX_METRIKA_COUNTER_ID
          : process.env.YANDEX_WEBMASTER_TOKEN;
    const bound =
      c.siteId === site.id &&
      (source === "WEBMASTER"
        ? Boolean(c.hostId)
        : c.counterId === process.env.YANDEX_METRIKA_COUNTER_ID);
    const running = row
      ? await db.jobRun.findFirst({
          where: {
            integrationId: row.id,
            siteId: site.id,
            status: {
              in: ["PENDING", "RUNNING", "WAITING_EXPORT", "WAITING_QUOTA"],
            },
          },
        })
      : null;
    const stale =
      !row?.lastSuccessfulSyncAt ||
      Date.now() - row.lastSuccessfulSyncAt.getTime() > 48 * 3600000;
    rows.push({
      source: source === "METRIKA" ? "Metrika" : "Webmaster",
      status: !token
        ? "NOT_CONFIGURED"
        : running
          ? "SYNCING"
          : !bound
            ? row?.status === "ERROR"
              ? "ERROR"
              : "WARNING"
            : row?.lastError
              ? row.status === "WARNING"
                ? "WARNING"
                : "ERROR"
              : stale
                ? "WARNING"
                : "HEALTHY",
      lastSuccess: bound ? (row?.lastSuccessfulSyncAt ?? null) : null,
      error: row?.lastError ?? null,
      nextRun: c.dailyEnabled ? (c.nextRunAt ?? null) : null,
    });
  }
  return rows;
}

