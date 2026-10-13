import type {AiActionProposal} from './contract';
export type SpecificityReason='ACTION_TOO_SHORT'|'ACTION_NOT_ACTIONABLE';
// Operation + concrete object, independent of declared area. Not an area classifier.
// Conservative language heuristic; acceptance still requires substantive quality review.
const checkOperation=/^(?:проверить|проверьте|проверять|проверка|проверку|оценить|оцените|оценка|оценку|сопоставить|сопоставьте|сопоставление|сравнить|сравните|сравнение|сверить|сверьте|сверка|осмотреть|осмотрите|осмотр|изучить|изучите|изучение|подтвердить|подтвердите|уточнить|уточните|убедиться|зафиксировать|зафиксируйте|check|inspect|verify|compare)$/u;
const changeOperation=/^(?:подготовить|подготовьте|подготовка|составить|составьте|заменить|замените|обновить|обновите|переписать|перепишите|переформулировать|переформулируйте|сократить|сократите|уточнить|уточните|отредактировать|отредактируйте|добавить|добавьте|включить|включите|указать|укажите|исправить|исправьте|разработать|rewrite|replace|edit|add)$/u;
const object=/^(?:текст\p{L}*|формулировк\p{L}*|описани\p{L}*|метаопис\p{L}*|анонс\p{L}*|сниппет\p{L}*|метатег\p{L}*|description|meta|title|h1|заголов\p{L}*|кноп\p{L}*|cta|ссыл\p{L}*|элемент\p{L}*|блок\p{L}*|информац\p{L}*|услови\p{L}*|путь|пути|сценари\p{L}*|процедур\p{L}*|оформлен\p{L}*|покупател\p{L}*|клиент\p{L}*|заказ\p{L}*|фасов\p{L}*|упаков\p{L}*|вариант\p{L}*|характерист\p{L}*|спецификац\p{L}*|применени\p{L}*|разметк\p{L}*|schema|html|документ\p{L}*|данн\p{L}*|наблюден\p{L}*|сопоставлен\p{L}*|навигац\p{L}*|экран\p{L}*|реквизит\p{L}*|контакт\p{L}*|способ\p{L}*|поле|поля|поля\p{L}*)$/u;
export function specificityReasons(p:Pick<AiActionProposal,'actionType'|'proposedAction'>):SpecificityReason[]{
 const text=p.proposedAction.trim(),reasons:SpecificityReason[]=[];
 // Reject fragments, not otherwise concrete short actions like “Проверить H1”.
 if([...text].length<8)reasons.push('ACTION_TOO_SHORT');
 const operation=p.actionType==='CHECK'?checkOperation:changeOperation;
 const actionable=text.split(/[.!?;\n]/u).some(clause=>{
  const tokens=clause.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu)??[];
  return tokens.some((token,i)=>operation.test(token)&&!['не','нельзя','без'].includes(tokens[i-1]??'')&&
   tokens.some((candidate,j)=>j!==i&&Math.abs(j-i)<=10&&object.test(candidate)));
 });
 if(!actionable)reasons.push('ACTION_NOT_ACTIONABLE');
 return reasons;
}
