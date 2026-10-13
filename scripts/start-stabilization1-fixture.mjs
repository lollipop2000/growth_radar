import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {database}=JSON.parse(readFileSync('test-results/stabilization1-test-db.json','utf8'));
if(!/^radar_stabilization1_\d+$/.test(database))throw Error('Invalid fixture database');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;
const env={...process.env,DATABASE_URL:url.href,PORT:process.env.PORT??'3000',HOSTNAME:'127.0.0.1',SCANNER_WORKER_DISABLED:'1'};
for(const key of ['YANDEX_METRIKA_TOKEN','YANDEX_WEBMASTER_TOKEN','LLM_API_KEY'])env[key]='';
console.log('Fixture-only server; database '+database);
const child=spawn(process.execPath,['scripts/start.mjs'],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code??1));
