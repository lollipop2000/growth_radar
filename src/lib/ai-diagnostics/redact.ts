import {SYSTEM_PROMPT} from '../seo-review/prompt';
import {SYSTEM_PROMPT as SYSTEM_PROMPT_V3} from '../seo-review/v3/prompt';
/** Diagnostic-only redaction. Never store transport envelopes, full prompt or arbitrary extra keys. */
export function redactDiagnostic(text:string,env:NodeJS.ProcessEnv=process.env):string{
 let value=text.split(SYSTEM_PROMPT).join('[OMITTED_PROMPT]').split(SYSTEM_PROMPT_V3).join('[OMITTED_PROMPT]');
 for(const [key,secret]of Object.entries(env))if(/key|token|password|secret|database_url/i.test(key)&&secret&&secret.length>=4)value=value.split(secret).join('[REDACTED]');
 value=value.replace(/https?:\/\/[^\s<>"']+/gi,raw=>{try{const u=new URL(raw);u.username='';u.password='';for(const key of [...u.searchParams.keys()])if(/key|token|password|secret|auth|session|cookie/i.test(key))u.searchParams.set(key,'REDACTED');return u.href;}catch{return '[REDACTED_URL]';}});
 return value.replace(/^\s*[A-Z][A-Z0-9_]{2,}\s*=.*$/gm,'[OMITTED_ENV_ASSIGNMENT]')
  .replace(/\bBearer\s+[^\s,;"'<>]+/gi,'Bearer [REDACTED]')
  .replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g,'[REDACTED]')
  .replace(/(?:authorization|cookie|set-cookie|x-api-key)\s*[:=][^\r\n]*/gi,'[OMITTED_SENSITIVE_HEADER]')
  .replace(/(?:["']?(?:api[_ -]?key|access[_ -]?token|password|authorization|cookie|set-cookie|x-api-key)["']?\s*[:=]\s*)[^\r\n,;}]+/gi,'[REDACTED_HEADER_OR_SECRET]')
  .replace(/\b[\w.+-]{1,64}@[\w.-]{1,253}\.[a-z]{2,63}\b/gi,'[REDACTED_EMAIL]');
}
export function scrub<T>(v:T):T{
 function walk(x:unknown):unknown{if(typeof x==='string')return redactDiagnostic(x);if(Array.isArray(x))return x.map(walk);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,val])=>[redactDiagnostic(k),/^(?:authorization|cookies?|headers|rawHttpResponse|prompt|messages|env|systemPrompt)$/i.test(k)?'[OMITTED]':walk(val)]));return x;}
 return walk(v) as T;
}
