import 'server-only';
import {timed} from '../timing';
import {Prisma} from '@prisma/client';
import {db} from '../db';
import {effectiveSearch} from './model';
export const searchSelect={siteId:true,date:true,url:true,query:true,region:true,source:true,importedAt:true,grain:true,periodMonth:true,pageId:true,normalizedQuery:true,normalizedUrl:true,impressions:true,clicks:true,ctr:true,avgPosition:true,id:true,matchStatus:true,matchReason:true,demand:true} as const;
export type SearchProjection=Prisma.WebmasterQueryDailyGetPayload<{select:typeof searchSelect}>;
export type SearchCapture={range:{gte:Date;lte:Date};rows?:SearchProjection[]};
export async function searchDataset(where:{siteId:string;date?:{gte:Date;lte:Date};pageId?:string},hostId?:string,capture?:SearchCapture){
 const {pageId,...siteWhere}=where;
 const source={OR:[{source:'WEBMASTER_IMPORT'},...(hostId?[{hostId,source:'WEBMASTER_API'}]:[])]};
 const candidateUrls=pageId?await db.webmasterQueryDaily.findMany({where:{...where,...source},select:{url:true},distinct:['url']}):[];
 const rows=await timed('search',()=>db.webmasterQueryDaily.findMany({where:{...siteWhere,...source,...(pageId?{url:{in:candidateUrls.map(r=>r.url)}}:{})},select:searchSelect,orderBy:{date:'asc'}}));
 if(capture)capture.rows=effectiveSearch(rows,capture.range);
 return effectiveSearch(rows,where.date).filter(r=>!pageId||r.pageId===pageId);
}
/** Summary screens need raw identity/provenance for dedup, but no matching/debug columns. */
export const analyticsSearchSelect={siteId:true,date:true,url:true,query:true,region:true,source:true,importedAt:true,grain:true,periodMonth:true,pageId:true,impressions:true,clicks:true,avgPosition:true,demand:true} as const;
export async function analyticsSearchDataset(where:{siteId:string;date:{gte:Date;lte:Date}},hostId?:string){
 // One narrow JSON transport avoids Prisma's per-row decoding of large summary reads.
 // Keep every raw identity and provenance field; effectiveSearch still owns semantics.
 const packet=await timed('search',()=>db.$queryRaw<{rows:string}[]>(Prisma.sql`
  SELECT COALESCE(json_agg(json_build_array(NULL,(extract(epoch FROM date)*1000)::bigint,url,query,region,source,(extract(epoch FROM "importedAt")*1000)::bigint,grain,"periodMonth","pageId",impressions,clicks,"avgPosition",demand) ORDER BY date),'[]'::json)::text AS rows
  FROM "WebmasterQueryDaily"
  WHERE "siteId"=${where.siteId} AND date>=${where.date.gte} AND date<=${where.date.lte}
   AND (source='WEBMASTER_IMPORT' ${hostId?Prisma.sql`OR (source='WEBMASTER_API' AND "hostId"=${hostId})`:Prisma.empty})
 `));
 type Row=Prisma.WebmasterQueryDailyGetPayload<{select:typeof analyticsSearchSelect}>;
 const rows:Row[]=JSON.parse(packet[0].rows).map((r:unknown[])=>({siteId:where.siteId,date:new Date(r[1] as number),url:r[2],query:r[3],region:r[4],source:r[5],importedAt:new Date(r[6] as number),grain:r[7],periodMonth:r[8],pageId:r[9],impressions:r[10],clicks:r[11],avgPosition:r[12],demand:r[13]}));
 return effectiveSearch(rows,where.date);
}
