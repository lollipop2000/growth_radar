/** V3 review scope only. Does not alter deterministic Search classification. */
export const oilTopic=/мас(?:л|ел)|смазк|антифриз|hlp|hvlp|5w|10w|15w|motor\s+oil/iu;
export function queryRelevance(query:string,pageType:string){
 const q=query.toLowerCase().replace(/ё/g,'е');
 if(/официальн.{0,12}сайт/u.test(q))return {classification:'NAVIGATIONAL'};
 if(/газпром\s*маркет/u.test(q))return {classification:'UNCERTAIN'};
 if(/подбор\s+мас|заправк|азс|ваканс|работа\s+в/u.test(q))return {classification:'ADJACENT'};
 if(['category','product','homepage'].includes(pageType)&&oilTopic.test(q))return {classification:/оптом|поставщик|закупк|предприят|автопарк|промышлен|для\s+бизнеса/u.test(q)?'TARGET_B2B':'ADJACENT'};
 if(/магазин/u.test(q))return {classification:'NAVIGATIONAL'};
 return {classification:'UNCERTAIN'};
}
