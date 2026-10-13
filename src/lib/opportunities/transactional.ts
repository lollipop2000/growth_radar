import type {BusinessInput} from './aggregate';
import type {Range,Sales} from './model';
import {days} from '../yandex/dates';
export type SalesImport={id:string;salesImportMode:string;coverageFrom:Date|null;coverageTo:Date|null;createdAt:Date;finishedAt?:Date|null;excludedSkus?:string[]};
export type SalesProvenance={importId:string;mode:string;coverageFrom:string|null;coverageTo:string|null;selectedDays:number;zeroFilledDays:number};
export type CoveredSales=Sales & {provenance:SalesProvenance[];transactionalDays:number;complete:boolean;latestDate:string|null};
const iso=(d:Date|null|undefined)=>d?.toISOString().slice(0,10)??null;
const at=(i:SalesImport)=>(i.finishedAt??i.createdAt).valueOf();
function salesCalendar(range:Range,imports:SalesImport[]){return {dates:days(range.from,range.to,range.grain==='MONTH'?600:90),ordered:[...imports].sort((a,b)=>at(b)-at(a)||b.id.localeCompare(a.id)).map(source=>({source,from:iso(source.coverageFrom),to:iso(source.coverageTo),excluded:new Set(source.excludedSkus)}))};}
/** Request-local common dates/metadata; each SKU still selects its own observations. */
export function coveredSalesCalculator(range:Range,imports:SalesImport[]){const calendar=salesCalendar(range,imports);return (rows:BusinessInput[],sku:string)=>coveredSales(rows,range,sku,imports,calendar);}
// Only called for a current active, conflict-free mapping in the selected Site.
// Candidate imports already come from confirmed SALES imports of that Site.
export function coveredSales(rows:BusinessInput[],range:Range,sku:string,imports:SalesImport[],calendar=salesCalendar(range,imports)):CoveredSales|null {
  const dated=rows.filter(r=>r.sku===sku&&r.date&&iso(r.date)!>=range.from&&iso(r.date)!<=range.to);
  const byDay=new Map<string,Map<string,BusinessInput[]>>();
  for(const r of dated){const date=iso(r.date)!,map=byDay.get(date)??new Map();map.set(r.importId,[...map.get(r.importId)??[],r]);byDay.set(date,map);}
  const sums={orders:0,quantity:0,quantityKg:0,revenue:0},unknown=new Set<string>(),provenance=new Map<string,SalesProvenance>();
  let knownDays=0,transactionalDays=0;const freshnessDates:string[]=[];
  for(const date of calendar.dates) {
    const observations=byDay.get(date);
    const selection=calendar.ordered.find(i=>observations?.has(i.source.id)||(i.source.salesImportMode==='TRANSACTIONAL'&&!i.excluded.has(sku)&&i.from!<=date&&i.to!>=date)),candidate=selection?.source;
    // Legacy rows without typed metadata retain conservative semantics.
    const selected=candidate?observations?.get(candidate.id):[...(observations?.values()??[])].sort((a,b)=>b[0].createdAt.valueOf()-a[0].createdAt.valueOf())[0];
    if(!candidate&&!selected)continue;
    const transactional=!!candidate&&candidate.salesImportMode==='TRANSACTIONAL'&&selection!.from!<=date&&selection!.to!>=date;
    knownDays++;if(transactional)transactionalDays++;
    const id=candidate?.id??selected![0].importId;
    const p=provenance.get(id)??{importId:id,mode:candidate?.salesImportMode??'UNKNOWN',coverageFrom:selection?.from??null,coverageTo:selection?.to??null,selectedDays:0,zeroFilledDays:0};
    p.selectedDays++;if(!selected)p.zeroFilledDays++;provenance.set(id,p);
    freshnessDates.push(transactional?selection!.to!:date);
    for(const k of ['orders','quantity','quantityKg','revenue'] as const)if(selected){if(selected.some(r=>r[k]==null))unknown.add(k);else sums[k]+=selected.reduce((s,r)=>s+Number(r[k]),0);}
  }
  if(!knownDays)return null;
  return {...sums,...Object.fromEntries([...unknown].map(k=>[k,null])),days:knownDays,complete:knownDays===range.days,transactionalDays,provenance:[...provenance.values()],latestDate:freshnessDates.sort().at(-1)??null};
}
