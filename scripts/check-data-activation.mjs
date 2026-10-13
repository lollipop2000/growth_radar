import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const {database}=JSON.parse(readFileSync('test-results/stabilization1-test-db.json','utf8'));
if(!/^radar_stabilization1_\d+$/.test(database))throw Error('Invalid fixture database');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;
const env={...process.env,DATABASE_URL:url.href};mkdirSync('test-results/data-activation-checks',{recursive:true});
const results=[];
const tasks=[['schema',['node_modules/prisma/build/index.js','migrate','diff','--from-schema-datasource','prisma/schema.prisma','--to-schema-datamodel','prisma/schema.prisma','--exit-code']],['migrations',['node_modules/prisma/build/index.js','migrate','status']],...['scanner','waf','coverage','pacing','request-url','commerce','seo-actions','native-search','data-activation'].map(n=>[n,['--conditions=react-server','--import=tsx','scripts/acceptance-'+n+'.ts']])];
for(const [name,args]of tasks){const r=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:10000000});let log=(r.stdout??'')+(r.stderr??'');for(const key of ['DATABASE_URL','POSTGRES_PASSWORD','YANDEX_METRIKA_TOKEN','YANDEX_WEBMASTER_TOKEN'])for(const value of [env[key],process.env[key]])if(value)log=log.split(value).join('[redacted]');writeFileSync('test-results/data-activation-checks/'+name+'.log',log);results.push({name,status:r.status===0?'PASS':'FAIL'});writeFileSync('test-results/data-activation-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));if(r.status!==0){console.log(log.slice(-3000));process.exit(1);}}
