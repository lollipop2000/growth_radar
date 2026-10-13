import {normalizeUrl} from '../scanner/url';
export type Eligibility='ELIGIBLE'|'NOT_ELIGIBLE'|'UNCERTAIN';
export type IndexabilitySnapshot={statusCode:number|null;outcome:string;source:string;canonical:string|null;robots:string|null;indexable:boolean|null;finalUrl?:string|null};
export function seoEligibility(url:string,s:IndexabilitySnapshot|null|undefined,aliases:string[]=[]):{status:Eligibility;reason:string}{
 if(!s)return {status:'UNCERTAIN',reason:'Нет снимка страницы'};
 if(['BLOCKED_BY_WAF','AUTH_REQUIRED'].includes(s.outcome))return {status:'UNCERTAIN',reason:'WAF/authentication не доказывает indexability страницы'};
 if(s.statusCode!=null&&s.statusCode!==200)return {status:'NOT_ELIGIBLE',reason:`HTTP ${s.statusCode}`};
 if(s.indexable===false||/\bnoindex\b/i.test(s.robots??''))return {status:'NOT_ELIGIBLE',reason:'noindex'};
 if(s.canonical){try{const canonical=normalizeUrl(s.canonical,s.finalUrl||url),identities=[url,...aliases,s.finalUrl??url].map(v=>normalizeUrl(v,url));if(!identities.includes(canonical))return {status:'NOT_ELIGIBLE',reason:'Canonical указывает на другой URL'};}catch{return {status:'UNCERTAIN',reason:'Некорректный canonical'};}}
 if(s.statusCode!==200||s.indexable==null)return {status:'UNCERTAIN',reason:'Недостаточно indexability signals'};
 if(s.source==='IMPORT'&&!s.canonical&&!s.robots)return {status:'UNCERTAIN',reason:'Legacy import не подтверждает canonical/meta robots'};
 return {status:'ELIGIBLE',reason:'HTTP 200, indexable, нет другого canonical'};
}
export function modernSignals(value:unknown){const s=value as {visibleText?:unknown;topText?:unknown;commercial?:unknown}|null;return !!s&&typeof s.visibleText==='string'&&typeof s.topText==='string'&&s.commercial!=null&&typeof s.commercial==='object';}
export function searchUrlKind(raw:string){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return 'MALFORMED_OTHER';if(/\.(pdf|docx?|xlsx?|pptx?)(?:$|\/)/i.test(u.pathname))return 'DOCUMENT';if(u.search||/\/filter\//i.test(u.pathname))return 'QUERY_FILTER';if(/^\/catalog\/\d+\/?$/i.test(u.pathname))return 'LEGACY_NUMERIC';return 'OTHER_HTML';}catch{return 'MALFORMED_OTHER';}}
