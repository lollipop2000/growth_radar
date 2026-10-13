import { normalizeUrl } from "../scanner/url";
export type MatchPage = {
  id: string;
  normalizedUrl: string;
  aliasesJson: unknown;
};
export function matchUrl(raw: string, base: string, pages: MatchPage[]) {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(raw, base);
  } catch {
    return {
      normalizedUrl: raw,
      pageId: null,
      matchStatus: "UNMATCHED",
      matchReason: "unknown",
    };
  }
  let url: URL;
  try {
    url = new URL(normalizedUrl);
  } catch {
    return {
      normalizedUrl,
      pageId: null,
      matchStatus: "UNMATCHED",
      matchReason: "unknown",
    };
  }
  if (url.origin !== new URL(base).origin)
    return {
      normalizedUrl,
      pageId: null,
      matchStatus: "UNMATCHED",
      matchReason: "different host",
    };
  const exact = pages.find((p) => p.normalizedUrl === normalizedUrl);
  if (exact)
    return {
      normalizedUrl,
      pageId: exact.id,
      matchStatus: "MATCHED",
      matchReason: "normalized URL",
    };
  const aliases = pages.filter(
    (p) =>
      Array.isArray(p.aliasesJson) && p.aliasesJson.includes(normalizedUrl),
  );
  if (aliases.length === 1)
    return {
      normalizedUrl,
      pageId: aliases[0].id,
      matchStatus: "MATCHED",
      matchReason: "observed redirect alias",
    };
  if (aliases.length > 1)
    return {
      normalizedUrl,
      pageId: null,
      matchStatus: "UNMATCHED",
      matchReason: "redirect",
    };
  if (
    url.search &&
    pages.some((p) => {
      const u = new URL(p.normalizedUrl);
      return u.origin === url.origin && u.pathname === url.pathname;
    })
  )
    return {
      normalizedUrl,
      pageId: null,
      matchStatus: "UNMATCHED",
      matchReason: "query parameters",
    };
  const likely = pages.some((p) => {
    const u = new URL(p.normalizedUrl);
    return u.pathname.toLowerCase() === url.pathname.toLowerCase();
  });
  return {
    normalizedUrl,
    pageId: null,
    matchStatus: "UNMATCHED",
    matchReason: likely ? "normalization mismatch" : "page not scanned",
  };
}
/** Request-local index. Exact matches precede aliases, including ambiguous aliases. */
export function urlMatcher(base:string,pages:MatchPage[]){
 const exact=new Map<string,MatchPage>(),aliases=new Map<string,MatchPage[]>();for(const p of pages){if(!exact.has(p.normalizedUrl))exact.set(p.normalizedUrl,p);if(Array.isArray(p.aliasesJson))for(const value of new Set(p.aliasesJson))if(typeof value==='string'){const rows=aliases.get(value)??[];rows.push(p);aliases.set(value,rows);}}
 return (raw:string)=>{let url:string;try{url=normalizeUrl(raw,base);if(new URL(url).origin!==new URL(base).origin)return matchUrl(raw,base,pages);}catch{return matchUrl(raw,base,pages);}const p=exact.get(url);if(p)return {normalizedUrl:url,pageId:p.id,matchStatus:'MATCHED',matchReason:'normalized URL'};const candidates=aliases.get(url);if(candidates?.length===1)return {normalizedUrl:url,pageId:candidates[0].id,matchStatus:'MATCHED',matchReason:'observed redirect alias'};if(candidates&&candidates.length>1)return {normalizedUrl:url,pageId:null,matchStatus:'UNMATCHED',matchReason:'redirect'};return matchUrl(raw,base,pages);};
}
