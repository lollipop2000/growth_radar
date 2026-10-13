import {salesModeLabels} from '../lib/business/sales-mode';
export function SalesImportFields({mode='UNKNOWN',from,to,profiles=[],saveProfile=true}:{mode?:string;from?:string|null;to?:string|null;profiles?:{id:string;name:string;salesImportMode:string}[];saveProfile?:boolean}){
 return <fieldset><legend>Тип выгрузки продаж и период покрытия</legend>
  <label>Тип выгрузки продаж<select name="salesImportMode" defaultValue={mode}>{Object.entries(salesModeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <label>Начало покрытия<input type="date" name="coverageFrom" defaultValue={from??''}/></label><label>Окончание покрытия<input type="date" name="coverageTo" defaultValue={to??''}/></label>
  <p>Для транзакционной выгрузки явно подтвердите обе даты. Отсутствие транзакций внутри периода трактуется как 0 продаж. Пустые показатели в существующих строках остаются неизвестными.</p>
  {!!profiles.length&&<label>Сохранённый профиль (тип применяется, если выше не задан)<select name="profileId" defaultValue=""><option value="">Без профиля</option>{profiles.map(p=><option value={p.id} key={p.id}>{p.name} · {salesModeLabels[p.salesImportMode]}</option>)}</select></label>}
  {saveProfile&&<label>Сохранить тип в профиле (необязательно)<input name="profileName" maxLength={120}/></label>}
 </fieldset>;
}
