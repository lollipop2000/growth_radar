import {normalizeUrl} from './url';
export type RedirectHop={sourceUrl:string;targetUrl:string;statusCode:number};
export type RedirectSnapshot={requestedUrl:string|null;finalUrl:string|null;statusCode:number|null;outcome:string;source:string;redirectsJson:unknown};
export function redirectHops(value:unknown):RedirectHop[]{
 if(!Array.isArray(value))return [];
 return value.filter((v):v is RedirectHop=>!!v&&typeof v==='object'&&typeof v.sourceUrl==='string'&&typeof v.targetUrl==='string'&&[301,302,303,307,308].includes(v.statusCode));
}
/** Canonical is deliberately absent; only a successful observed navigation qualifies. */
export function observedRedirect(s:RedirectSnapshot,base:string){
 if(s.source==='IMPORT'||s.outcome!=='OK'||s.statusCode==null||s.statusCode<200||s.statusCode>=300||!s.requestedUrl||!s.finalUrl)return false;
 try{
  const source=normalizeUrl(s.requestedUrl),final=normalizeUrl(s.finalUrl),origin=new URL(base).origin;
  if(new URL(source).origin!==origin||new URL(final).origin!==origin||source===final)return false;
  const hops=redirectHops(s.redirectsJson);
  if(hops.length)return normalizeUrl(hops[0].sourceUrl)===source&&normalizeUrl(hops.at(-1)!.targetUrl)===final&&hops.every((h,i)=>new URL(h.sourceUrl).origin===origin&&new URL(h.targetUrl).origin===origin&&(i===0||normalizeUrl(hops[i-1].targetUrl)===normalizeUrl(h.sourceUrl)));
  // Legacy snapshots captured an observed redirect chain, but not each hop's status.
  return Array.isArray(s.redirectsJson)&&s.redirectsJson.some(v=>typeof v==='string'&&normalizeUrl(v)===source);
 }catch{return false;}
}
