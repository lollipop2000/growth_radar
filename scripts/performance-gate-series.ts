import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {db} from '../src/lib/db';
import {Prisma} from '@prisma/client';
const base='test-results/sprint5-3-performance-gate'+(process.env.PERF_GATE_SUFFIX??''),route='/pages/cmuv6ydso000t20gomgcaf3mg?searchPeriod=M3';
const walks=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walks(join(dir,e.name)):[join(dir,e.name)]);
const hashes=()=>Object.fromEntries([...walks('src'),...walks('prisma'),'.env',...walks('.next/server').filter(p=>/\.(js|json)$/.test(p)),'.next/BUILD_ID',...walks('test-results').filter(p=>/sprint(?:4-1-live|4-2-live|4-2-1-revalidation|5-live-|5-1-live-|5-1-live-review-|5-2-live-diagnostic).*\.json$/.test(p))].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
async function idle(){if(await db.scan.count({where:{status:{in:['PENDING','RUNNING','PAUSING','STOPPING','IMPORTING']}}}))throw Error('ACTIVE_SCANS_REFUSE_DIAGNOSTICS');}
async function telemetry(){const started=performance.now();const database=await db.$queryRaw`SELECT numbackends,xact_commit,xact_rollback,blks_read,blks_hit,temp_files,deadlocks,stats_reset FROM pg_stat_database WHERE datname=current_database()`;const waits=await db.$queryRaw`SELECT state,wait_event_type,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type`;const host=await new Promise<string>((resolveResult,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-Command',"$c=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \"Name='_Total'\"; $m=Get-CimInstance Win32_OperatingSystem; @{cpuPercent=$c.PercentProcessorTime;freeMemoryKB=$m.FreePhysicalMemory}|ConvertTo-Json -Compress"],{windowsHide:true});let out='';p.stdout.on('data',b=>out+=b);p.once('error',reject);p.once('exit',()=>resolveResult(out.trim()));});return {database,waits,host:JSON.parse(host),collectorMs:performance.now()-started};}
let worker:ReturnType<typeof spawn>|undefined,server:ReturnType<typeof spawn>|undefined;
const serial=(v:unknown)=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?v.toString():v);
async function stopWorker(){if(!worker)return;const current=worker;worker=undefined;if(current.exitCode!==null)return;await new Promise<void>(done=>{current.once('exit',()=>done());current.kill();});}
async function dataHashes(){const result:Record<string,unknown>={};for(const table of ['Scan','ScanPage','JobRun','MetrikaPageDaily','WebmasterQueryDaily','BusinessRecord','Import','Opportunity','Page','SeoAction'])result[table]=await db.$queryRaw(Prisma.sql`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY t.id),'')) AS hash FROM ${Prisma.raw('"'+table+'"')} t`);return result;}
try{
 await idle();if(existsSync(base+'-series.jsonl'))throw Error('SERIES_ALREADY_EXISTS');const before=hashes(),dataBefore=await dataHashes();writeFileSync(base+'-fingerprint-before.json',serial(before));writeFileSync(base+'-data-before.json',serial(dataBefore));
 const pg=await db.$queryRaw`SELECT name,setting FROM pg_settings WHERE name IN ('server_version','shared_buffers','effective_cache_size','track_io_timing','max_connections')`;
 const extensions=await db.$queryRaw`SELECT extname FROM pg_extension`;
 writeFileSync(base+'-postgres-config.json',serial({pg,extensions}));
 server=spawn(process.execPath,['--require',resolve('scripts/performance-gate-preload.cjs'),'.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'3000',PERF_GATE_LOG:resolve(base+'-requests.jsonl')},stdio:['ignore','pipe','pipe'],windowsHide:true});
 server.stdout?.on('data',()=>{});server.stderr?.on('data',()=>{});
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:3000'+route,{headers:{'x-performance-gate':'cold'}});await r.text();if(r.status===200)break;}catch{}await delay(1000);if(i===59)throw Error('SERVER_NOT_READY');}
 for(let i=0;i<3;i++){await(await fetch('http://127.0.0.1:3000'+route,{headers:{'x-performance-gate':'warmup-'+i}})).text();}
 for(const [index,enabled]of [false,true,false,true,false,true].entries()){
  await idle();await stopWorker();if(enabled){worker=spawn(process.execPath,['--require',resolve('scripts/performance-gate-preload.cjs'),'--conditions=react-server','--import=tsx','scripts/worker.ts'],{env:{...process.env,PERF_GATE_LOG:resolve(base+'-worker-network.jsonl')},stdio:'ignore',windowsHide:true});await delay(6000);if(worker.exitCode!==null)throw Error('WORKER_FAILED');}
  await delay(3000);const before=await telemetry();const samples=[];
  for(let sample=0;sample<8;sample++){await idle();const start=performance.now(),r=await fetch('http://127.0.0.1:3000'+route,{headers:{'x-performance-gate':`${index}-${sample}`}}),ttfbMs=performance.now()-start;const body=await r.arrayBuffer();samples.push({sample,status:r.status,ttfbMs,totalMs:performance.now()-start,bytes:body.byteLength});await delay(200);}
  const after=await telemetry();appendFileSync(base+'-series.jsonl',serial({index,worker:enabled,nextPid:server.pid,workerPid:worker?.pid,buildId:readFileSync('.next/BUILD_ID','utf8').trim(),samples,before,after})+'\n');console.log(serial({series:index,worker:enabled,samples:8,apiCalls:0}));
 }
 await stopWorker();await idle();const after=hashes(),dataAfter=await dataHashes();writeFileSync(base+'-fingerprint-after.json',serial(after));writeFileSync(base+'-data-after.json',serial(dataAfter));if(serial(before)!==serial(after))throw Error('SOURCE_OR_BUILD_CHANGED');if(serial(dataBefore)!==serial(dataAfter))throw Error('DATA_CHANGED');console.log('PASS: SAME_BUILD_SAME_NEXT_PID_SIX_SERIES_ZERO_API');
}finally{await stopWorker();server?.kill();await db.$disconnect();}
