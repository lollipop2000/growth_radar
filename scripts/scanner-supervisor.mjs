import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export function workerHealthPath(){return resolve('.runtime','scanner-'+createHash('sha256').update(process.env.DATABASE_URL??'').digest('hex').slice(0,16)+'.json');}
export function readWorkerHealth(){try{const h=JSON.parse(readFileSync(workerHealthPath(),'utf8'));return {...h,available:Date.now()-h.at<30000&&!['ERROR','STOPPED'].includes(h.stage)};}catch{return {available:false,stage:'OFFLINE'};}}
export function writeWorkerHealth(stage){mkdirSync(resolve('.runtime'),{recursive:true});const path=workerHealthPath(),temp=path+'.'+process.pid+'.tmp';writeFileSync(temp,JSON.stringify({pid:process.pid,at:Date.now(),stage}));renameSync(temp,path);}
export function superviseScanner({spawnWorker=()=>spawn(process.execPath,['--conditions=react-server','--import=tsx','scripts/worker.ts'],{env:process.env,stdio:'inherit',windowsHide:true}),readHealth=readWorkerHealth,onHealth=writeWorkerHealth,now=Date.now,onEvent=console.log,intervalMs=5000,staleMs=90000}={}){
 let child,stopped=false,started=0,nextStart=0,restarts=0;
 function tick(){
  if(stopped)return;
  if(!child){if(now()<nextStart)return;onHealth('STARTING');child=spawnWorker();started=now();onEvent('Scanner supervisor: worker started');child.once('exit',()=>{child=undefined;nextStart=now()+Math.min(30000,1000*2**Math.min(restarts++,5));onEvent('Scanner supervisor: worker exited; restart scheduled');});child.once('error',()=>{onEvent('Scanner supervisor: worker launch failed');});return;}
  const health=readHealth();if(now()-Math.max(started,health.at??0)>staleMs){onEvent('Scanner supervisor: worker heartbeat expired; restarting');child.kill();}
 }
 const timer=setInterval(tick,intervalMs);tick();return {tick,stop(){stopped=true;clearInterval(timer);child?.kill();}};
}
