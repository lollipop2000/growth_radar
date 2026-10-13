export function mainTop<T extends {pageId:string;domain:string;primaryType:string;ruleId:string}>(items:T[],limit=5):T[]{
  const seen=new Set<string>();return items.filter(o=>{if(o.domain==='DATA_QUALITY'||o.primaryType==='DATA_QUALITY'||o.ruleId==='RULE_21'||seen.has(o.pageId))return false;seen.add(o.pageId);return true;}).slice(0,limit);
}
