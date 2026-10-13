import 'server-only';
export function aiConfig(env:Record<string,string|undefined>=process.env) {
  const integer=(name:string,fallback:number,min:number,max:number)=>{
    const value=env[name]?Number(env[name]):fallback;
    return Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
  };
  const key=env.DEEPSEEK_API_KEY?.trim()??'',model=env.DEEPSEEK_MODEL?.trim()??'';
  const baseUrl=env.DEEPSEEK_BASE_URL?.trim()||'https://api.deepseek.com';
  let valid=false;try{const u=new URL(baseUrl);valid=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{}
  return {enabled:env.AI_ENABLED==='true'&&!!key&&!!model&&valid,key,model,baseUrl,
    timeoutMs:integer('AI_TIMEOUT_MS',60000,1000,120000),maxOutputTokens:integer('AI_MAX_OUTPUT_TOKENS',6000,256,8000)};
}
export function aiAvailable(){return aiConfig().enabled;}
