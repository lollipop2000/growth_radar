import "server-only";
import {Prisma} from '@prisma/client';
import { createHash } from "node:crypto";
import { db } from "../db";
import { day } from "./dates";
import { matchUrl, urlMatcher } from "./matching";
import { json } from "./settings";
import type { MetrikaRow } from "./metrika";
import type { WebmasterRow } from "./webmaster";
import {normalizeQuery} from '../search/model';
import {normalizeUrl} from '../scanner/url';
export const usablePageWhere = { active: true, scanPages: { some: { outcome: "OK", statusCode: { gte: 200, lt: 400 } } } };
export function rowKey(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
export async function saveMetrikaRows(
  jobId: string,
  rows: MetrikaRow[],
  meta: unknown,
  checkpoint: unknown,
) {
  const job = await db.jobRun.findUniqueOrThrow({
      where: { id: jobId },
      include: { site: true },
    }),
    c = job.configJson as { counterId: string };
  const pages = await db.page.findMany({
    where: { siteId: job.siteId, ...usablePageWhere },
    select: { id: true, normalizedUrl: true, aliasesJson: true },
  });
  const keys = rows.map((r) => rowKey(r.url));
  if (new Set(keys).size !== keys.length) throw new Error("DUPLICATE_API_ROWS");
  await db.$transaction(
    async (tx) => {
      for (const r of rows) {
        const data = {
          siteId: job.siteId,
          counterId: c.counterId,
          date: day(r.date),
          url: r.url,
          ...matchUrl(r.url, job.site.baseUrl, pages),
          rowKey: rowKey(r.url),
          visits: r.visits,
          visitors: r.visitors,
          pageviews: r.pageviews,
          bounceRate: r.bounceRate,
          avgVisitDuration: r.avgVisitDuration,
          goalConversionsJson: json(r.goalConversionsJson),
          reportMetaJson: json(meta),
          rawJson: json(r.rawJson),
          jobRunId: jobId,
          importedAt: new Date(),
        };
        await tx.metrikaPageDaily.upsert({
          where: {
            siteId_counterId_date_rowKey: {
              siteId: job.siteId,
              counterId: c.counterId,
              date: data.date,
              rowKey: data.rowKey,
            },
          },
          create: data,
          update: data,
        });
      }
      await tx.jobRun.update({
        where: { id: jobId },
        data: {
          rowsFetched: { increment: rows.length },
          rowsSaved: { increment: rows.length },
          checkpointJson: json(checkpoint),
        },
      });
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
export async function saveWebmasterRows(
  jobId: string,
  rows: WebmasterRow[],
  checkpoint: unknown,
) {
  const job = await db.jobRun.findUniqueOrThrow({
      where: { id: jobId },
      include: { site: true },
    }),
    c = job.configJson as { hostId: string };
  const pages = await db.page.findMany({
    where: { siteId: job.siteId, ...usablePageWhere },
    select: { id: true, normalizedUrl: true, aliasesJson: true },
  });
  const keys = rows.map((r) => rowKey(r.date, r.url, r.query, r.region));
  if (new Set(keys).size !== keys.length) throw new Error("DUPLICATE_API_ROWS");
  await db.$transaction(
    async (tx) => {
      for (const r of rows) {
        const data = {
          siteId: job.siteId,
          hostId: c.hostId,
          date: day(r.date),
          url: r.url,
          ...matchUrl(r.url, job.site.baseUrl, pages),
          rowKey: rowKey(r.url, r.query, r.region),
          query: r.query,
          normalizedQuery: normalizeQuery(r.query),
          source: 'WEBMASTER_API',
          region: r.region,
          impressions: r.impressions,
          clicks: r.clicks,
          avgPosition: r.avgPosition,
          ctr: r.ctr,
          rawJson: json(r.rawJson),
          jobRunId: jobId,
          importedAt: new Date(),
        };
        await tx.webmasterQueryDaily.upsert({
          where: {
            siteId_hostId_date_rowKey: {
              siteId: job.siteId,
              hostId: c.hostId,
              date: data.date,
              rowKey: data.rowKey,
            },
          },
          create: data,
          update: data,
        });
      }
      await tx.jobRun.update({
        where: { id: jobId },
        data: {
          rowsFetched: { increment: rows.length },
          rowsSaved: { increment: rows.length },
          checkpointJson: json(checkpoint),
        },
      });
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
  export async function rematchSite(siteId: string,urls?:string[]) {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } }),
    pages = await db.page.findMany({
      where: { siteId, ...usablePageWhere },
      select: { id: true, normalizedUrl: true, aliasesJson: true },
    });
  const matcher=urlMatcher(site.baseUrl,pages),cache=new Map<string,ReturnType<typeof matchUrl>>();
  const identities=urls?.map(url=>normalizeUrl(url,site.baseUrl));
  for (const source of ["METRIKA", "WEBMASTER"]) {
    let after: string | undefined;
    for (;;) {
        const where = { siteId, ...(after ? { id: { gt: after } } : {}),...(urls?{OR:[{url:{in:urls}},{normalizedUrl:{in:identities}}]}:{}) };
      const select = { id: true, url: true, normalizedUrl: true, pageId: true, matchStatus: true, matchReason: true } as const;
      const records =
        source === "METRIKA"
          ? await db.metrikaPageDaily.findMany({
              where,
              orderBy: { id: "asc" },
              take: 500,
              select,
            })
          : await db.webmasterQueryDaily.findMany({
              where,
              orderBy: { id: "asc" },
              take: 500,
              select,
            });
      if (!records.length) break;
      const changes=[];
      for (const row of records) {
        let match=cache.get(row.url);if(!match){match=matcher(row.url);cache.set(row.url,match);}
        if (row.pageId === match.pageId && row.normalizedUrl === match.normalizedUrl &&
          row.matchStatus === match.matchStatus && row.matchReason === match.matchReason) continue;
        changes.push(Prisma.sql`(${row.id}::text,${match.pageId}::text,${match.normalizedUrl}::text,${match.matchStatus}::text,${match.matchReason}::text)`);
      }
      if(changes.length){
        const table=source==='METRIKA'?Prisma.sql`"MetrikaPageDaily"`:Prisma.sql`"WebmasterQueryDaily"`;
        await db.$executeRaw(Prisma.sql`UPDATE ${table} AS t SET "pageId"=v.page_id,"normalizedUrl"=v.normalized_url,"matchStatus"=v.match_status,"matchReason"=v.match_reason,"updatedAt"=NOW() FROM (VALUES ${Prisma.join(changes)}) AS v(id,page_id,normalized_url,match_status,match_reason) WHERE t.id=v.id AND t."siteId"=${siteId}`);
      }
      after = records.at(-1)!.id;
    }
  }
}
