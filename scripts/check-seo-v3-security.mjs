import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const secrets=['DATABASE_URL','POSTGRES_PASSWORD','YANDEX_METRIKA_TOKEN','YANDEX_WEBMASTER_TOKEN','DEEPSEEK_API_KEY','LLM_API_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>=8);
const targets=[...files('src/lib/seo-review/v3'),...files('src/lib/ai-diagnostics'),...files('test-results').filter(p=>/sprint5-3[^\\/]*\.(json|log)$/.test(p)),...files('.next/static'),'SPRINT5_3_RELIABLE_SEO_RECOMMENDATIONS.md','scripts/ai-diagnostics.ts','scripts/acceptance-seo-v3-offline.ts','scripts/check-seo-v3-integrity.ts','tests/seo-review-v3.test.ts','tests/ai-diagnostics-v3.test.ts'];
for(const file of targets){const text=readFileSync(file,'utf8');if(secrets.some(v=>text.includes(v)))throw Error('CONFIGURED_SECRET_DETECTED');}
for(const file of files('.next/server').filter(p=>p.endsWith('.nft.json')))if(/ai-diagnostics[\\/]/.test(readFileSync(file,'utf8')))throw Error('DIAGNOSTICS_IN_PRODUCTION_TRACE');
console.log(JSON.stringify({status:'PASS',checkedFiles:targets.length,configuredSecretsPrinted:false,diagnosticsInProductionTrace:false,apiCalls:0}));
