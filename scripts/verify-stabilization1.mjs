import {spawnSync,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
const resume=process.argv.includes('--resume'),database=resume?JSON.parse(readFileSync('test-results/stabilization1-test-db.json','utf8')).database:'radar_stabilization1_'+Date.now();
if(!resume)execFileSync('docker',['compose','exec','-T','db','createdb','-U','radar',database],{stdio:'inherit'});
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;const env={...process.env,DATABASE_URL:url.href};
mkdirSync('test-results/stabilization1-checks',{recursive:true});
writeFileSync('test-results/stabilization1-test-db.json',JSON.stringify({database}));
const tasks=[['clean DB',['node_modules/prisma/build/index.js','migrate','deploy']],['migration status',['node_modules/prisma/build/index.js','migrate','status']],['schema drift',['node_modules/prisma/build/index.js','migrate','diff','--from-schema-datasource','prisma/schema.prisma','--to-schema-datamodel','prisma/schema.prisma','--exit-code']]];
const repeated=process.argv.includes('--repeat')?process.argv.slice(process.argv.indexOf('--repeat')+1).map(n=>n+' regression'):[];
const results=resume?JSON.parse(readFileSync('test-results/stabilization1-checks.json','utf8')).filter(r=>r.status==='PASS'&&!repeated.includes(r.name)):[];
function run(name,args){const start=Date.now(),r=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:10000000});let output=(r.stdout??'')+(r.stderr??'');for(const key of ['DATABASE_URL','POSTGRES_PASSWORD','YANDEX_METRIKA_TOKEN','YANDEX_WEBMASTER_TOKEN','LLM_API_KEY'])for(const secret of [process.env[key],env[key]])if(secret)output=output.split(secret).join('[redacted]');writeFileSync('test-results/stabilization1-checks/'+name.replaceAll(' ','-')+'.log',output);const result={name,status:r.status===0?'PASS':'FAIL',durationMs:Date.now()-start};results.push(result);writeFileSync('test-results/stabilization1-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(result));if(r.status!==0){console.log(output.slice(-2500));process.exit(1);}}
for(const [n,a]of tasks)if(!results.some(r=>r.name===n))run(n,a);
const db=new PrismaClient({datasourceUrl:url.href});
for(const type of ['Target Site','Yandex Metrika','Yandex Webmaster'])await db.integration.upsert({where:{type},create:{type,configJson:type==='Target Site'?{baseUrl:'http://127.0.0.1:49999/'}:{}},update:{}});
await db.$disconnect();
for(const name of ['scanner','worker','coverage','waf','yandex','sprint3','sprint3-1','business-data','commerce','sprint3-4','seo-actions','native-search','pacing','request-url','stabilization1-data'])if(!results.some(r=>r.name===name+' regression')){if(name==='business-data')await (await import('./stabilization1-fixture-guard.mjs')).assertFixtureServer(url.href);run(name+' regression',['--conditions=react-server','--import=tsx','scripts/acceptance-'+name+'.ts']);}
