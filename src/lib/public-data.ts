import "server-only";
import { redactUrl } from "./scanner/diagnostics";
const secretKey=/token|password|session|auth|secret|cookie|api.?key/i;
export function publicData<T>(input:T):T {
  const secrets=[process.env.YANDEX_METRIKA_TOKEN,process.env.YANDEX_WEBMASTER_TOKEN,process.env.LLM_API_KEY,process.env.DEEPSEEK_API_KEY,process.env.LLM_API_URL,process.env.DATABASE_URL,process.env.POSTGRES_PASSWORD].filter((v):v is string=>!!v&&v.length>3);
  function clean(v:unknown,key=""):unknown {if(secretKey.test(key))return "[скрыто]";if(typeof v==="string"){let text=v;for(const secret of secrets)text=text.split(secret).join("[скрыто]");text=text.replace(/https?:\/\/[^\s<>"']+/g,url=>redactUrl(url));return text;}if(Array.isArray(v))return v.map(item=>clean(item));if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,clean(val,k)]));return v;}
  return clean(input) as T;
}
