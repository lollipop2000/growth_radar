export const salesModeLabels:Record<string,string>={UNKNOWN:'Не задано (прежняя логика)',PARTIAL:'Снимок / неполная выгрузка',TRANSACTIONAL:'Транзакционная выгрузка'};
export type SalesMetadata={salesImportMode?:string;coverageFrom?:string|null;coverageTo?:string|null};
export function salesMetadata(input:SalesMetadata) {
  const mode=input.salesImportMode||'UNKNOWN',from=input.coverageFrom||null,to=input.coverageTo||null;
  if(!Object.hasOwn(salesModeLabels,mode))throw new Error('Выберите тип выгрузки продаж.');
  const valid=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if((from||to)&&(!from||!to||!valid(from)||!valid(to)||from>to))throw new Error('Укажите корректные начало и окончание периода.');
  if(mode==='TRANSACTIONAL'&&(!from||!to))throw new Error('Для транзакционной выгрузки явно подтвердите период покрытия.');
  return {salesImportMode:mode,coverageFrom:from?new Date(from+'T00:00:00Z'):null,coverageTo:to?new Date(to+'T00:00:00Z'):null};
}
