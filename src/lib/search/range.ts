import 'server-only';
import {db} from '../db';
import {searchRange,monthlySelection,selectedSearch,type SearchSelection} from './periods';
export async function availableMonths(siteId:string){return (await db.$queryRaw<{periodMonth:string}[]>`SELECT DISTINCT "periodMonth" FROM "WebmasterQueryDaily" WHERE "siteId"=${siteId} AND grain='MONTH' AND "periodMonth" IS NOT NULL`).map(r=>r.periodMonth);}
export async function rangeForSite(siteId:string,n:SearchSelection,now?:Date){const available=monthlySelection(n)?await availableMonths(siteId):[];return searchRange(n,available,now);}
export async function defaultSearchSelection(siteId:string,raw?:string,fallback=28){return selectedSearch(raw,await db.webmasterQueryDaily.findFirst({where:{siteId,grain:'MONTH'},select:{id:true}})?'M3':fallback);}
