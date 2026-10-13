import type {ProductMapping} from '../business/typed-import';
import type {ContentSignals} from './content';
import {normalizeUrl,classify} from './url';
const name=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
/** Conservative detail-page evidence; URL alone is never sufficient. */
export function productTypeClassifier(products:ProductMapping[]){
 const index=new Map<string,ProductMapping[]>();
 for(const p of products)if(p.active){const key=normalizeUrl(p.rawUrl),list=index.get(key)??[];list.push(p);index.set(key,list);}
 return (url:string,aliases:string[],h1:string|null,signals:ContentSignals|null):'product'|null=>{
 const u=new URL(url);
 if(u.search||/\/filter\//i.test(u.pathname)||classify(url)!=='category'||!h1||!signals)return null;
 const identities=new Set([url,...aliases].map(v=>normalizeUrl(v,url)));
 const mapped=[...new Set([...identities].flatMap(key=>index.get(key)??[]))];
 const groups=new Set(mapped.map(p=>p.productGroup));
 if(groups.size!==1||!mapped.length||mapped.some(p=>name(p.productName)!==name(h1)))return null;
 const top=signals.topText;
 // The saved product template starts with its name and SKU, then the detail panels.
 if(!top.startsWith(h1)||!mapped.some(p=>{const sku=/^\d+$/.test(p.sku)?'0*'+p.sku.replace(/^0+(?=\d)/,''):p.sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|\\D)${sku}(?=\\D|$)`).test(top);}))return null;
 if(!/Описание/i.test(top)||!/Документы|Характеристики/i.test(top)||!signals.commercial.price?.present||!signals.commercial.availability?.present)return null;
 return 'product';
 };
}
export function mappedProductType(url:string,aliases:string[],products:ProductMapping[],h1:string|null,signals:ContentSignals|null){return productTypeClassifier(products)(url,aliases,h1,signals);}
