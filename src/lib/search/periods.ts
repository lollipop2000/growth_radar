import {period} from '../yandex/dates';
export type SearchSelection=number|string;
export const searchPeriods=[['M1','1 месяц'],['M3','3 месяца'],['M6','6 месяцев'],['M12','12 месяцев'],['M18','18 месяцев'],['ALL','Весь доступный период']] as const;
export const monthlySelection=(n:SearchSelection)=>/^M(1|3|6|12|18)$/.test(String(n))||n==='ALL';
export function selectedSearch(raw?:string,fallback:SearchSelection=28):SearchSelection{if(raw&&monthlySelection(raw))return raw;return raw&&[7,28,30,90].includes(Number(raw))?Number(raw):fallback;}
export function shiftMonth(month:string,n:number){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
export function monthsBetween(from:string,to:string){const result:string[]=[];for(let m=from.slice(0,7);m<=to.slice(0,7);m=shiftMonth(m,1)){if(result.length>=240)throw new Error('Максимум 240 месяцев анализа.');result.push(m);}return result;}
export function searchRange(selection:SearchSelection,available:string[],now=new Date()){
 if(!monthlySelection(selection)){const n=Number(selection),range=period(n,now);return {...range,days:n,grain:'DAY',expectedMonths:[] as string[]};}
 const latest=[...available].sort().at(-1)??shiftMonth(now.toISOString().slice(0,7),-1),count=selection==='ALL'?Math.max(1,available.length?monthsBetween([...available].sort()[0],latest).length:1):Number(String(selection).slice(1)),from=shiftMonth(latest,-count+1)+'-01',end=new Date(shiftMonth(latest,1)+'-01T00:00:00Z');end.setUTCDate(0);const to=end.toISOString().slice(0,10);return {from,to,days:Math.round((+end-+new Date(from+'T00:00:00Z'))/86400000)+1,grain:'MONTH',expectedMonths:monthsBetween(from,to)};
}
