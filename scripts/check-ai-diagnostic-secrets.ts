import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DIAGNOSTIC_ROOT} from '../src/lib/ai-diagnostics/storage';
const walk=(root:string):string[]=>readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(root,e.name)):[join(root,e.name)]);
const values=Object.entries(process.env).filter(([key,value])=>/key|token|password|secret|database_url/i.test(key)&&value&&value.length>=8).map(([,value])=>value!);
const files=[...walk('src/lib/ai-diagnostics'),...walk(DIAGNOSTIC_ROOT),'scripts/ai-diagnostics.ts','scripts/ai-diagnostic-acl.ps1','scripts/acceptance-ai-diagnostics.ts','tests/ai-diagnostics.test.ts','SPRINT5_2_AI_SEO_DIAGNOSTICS.md',...readdirSync('test-results').filter(p=>p.startsWith('sprint5-2-')).map(p=>join('test-results',p))];
let checked=0;for(const path of files){if(lstatSync(path).size>2000000)throw Error('CHECK_BOUND_EXCEEDED');const text=readFileSync(path,'utf8');if(values.some(v=>text.includes(v)))throw Error('SECRET_EXPOSURE_DETECTED');checked++;}
const report={status:'PASS',filesChecked:checked,secretsPrinted:false,apiCalls:0};writeFileSync('test-results/sprint5-2-diagnostic-secrets.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
