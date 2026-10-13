import 'server-only';
import {db} from '../db';
import type {PageSeoReviewInput} from './contract';
import {knownProfileUrls} from './quality';
import {normalizeQuery} from '../search/model';
import type {Evidence} from './contract';
/** Exact saved identity/aliases, scoped to the current page's site. No fetch, no URL creation. */
export async function resolveSavedUrls(i:PageSeoReviewInput,urls:string[]):Promise<Set<string>>{
 const origin=new URL(i.page.currentUrl).origin,known=knownProfileUrls(i);
 const candidates=[...new Set(urls)].filter(u=>{try{return new URL(u).origin===origin&&!known.has(u);}catch{return false;}}).slice(0,30);
 if(!candidates.length)return new Set();
 const page=await db.page.findUnique({where:{id:i.page.pageId},select:{siteId:true}});if(!page)return new Set();
 const pages=await db.page.findMany({where:{siteId:page.siteId,OR:[{url:{in:candidates}},...candidates.map(u=>({aliasesJson:{array_contains:[u]}}))]},select:{url:true,aliasesJson:true}});
 const identities=new Set(pages.flatMap(p=>[p.url,...Array.isArray(p.aliasesJson)?p.aliasesJson.filter((u):u is string=>typeof u==='string'):[]]));
 return new Set(candidates.filter(u=>identities.has(u)));
}
/** Preliminary saved-page overlap only. A partial lexical lookup cannot establish a free niche. */
export async function savedLandingCandidates(i:PageSeoReviewInput,queries:string[]):Promise<Evidence[]>{
 const page=await db.page.findUnique({where:{id:i.page.pageId},select:{siteId:true}});if(!page)return [];
 const pages=await db.page.findMany({where:{siteId:page.siteId,active:true},orderBy:{url:'asc'},select:{url:true,aliasesJson:true,pageType:true,scanPages:{where:{outcome:'OK'},orderBy:{scannedAt:'desc'},take:1,select:{title:true,h1:true}}}});
 const terms=[...new Set(queries.flatMap(q=>normalizeQuery(q).split(/[^\p{L}\p{N}-]+/u).filter(t=>t.length>=5)))];
 return pages.filter(p=>{const text=normalizeQuery([p.url,p.scanPages[0]?.title,p.scanPages[0]?.h1,JSON.stringify(p.aliasesJson)].join(' '));return terms.some(t=>text.includes(t));}).slice(0,10).map((p,n)=>({id:'SAVED_LANDING_'+n,kind:'links.knownPage',value:{url:p.url,pageType:p.pageType,aliases:Array.isArray(p.aliasesJson)?p.aliasesJson.filter((v):v is string=>typeof v==='string'):[],title:p.scanPages[0]?.title??null},state:'KNOWN_PRESENT',coverage:'PARTIAL',source:'SAVED_PAGE_ALIAS_LOOKUP',observedAt:null,truncated:false,supportsAbsenceClaim:false}));
}
