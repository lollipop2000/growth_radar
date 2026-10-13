import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const prefix='test-results/sprint5-3-performance-gate';
const lines=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const median=a=>{a=[...a].sort((a,b)=>a-b);return(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
const round=n=>Math.round(n*100)/100;
function union(q){let end=0,total=0;for(const x of [...q].sort((a,b)=>a.start-b.start)){total+=Math.max(0,x.end-Math.max(end,x.start));end=Math.max(end,x.end);}return total;}
const result={};
for(const suffix of ['', '-control']){
 const base=prefix+suffix;if(!existsSync(base+'-series.jsonl'))continue;
 const requests=lines(base+'-requests.jsonl');
 result[suffix||'profiled']={cold:requests.filter(x=>x.marker==='cold'),warmup:requests.filter(x=>x.marker?.startsWith('warmup')).map(x=>round(x.wallMs)),externalBlocked:requests.filter(x=>x.kind==='EXTERNAL_REQUEST_BLOCKED').length,series:lines(base+'-series.jsonl').map(s=>{
  const r=requests.filter(r=>r.kind==='REQUEST'&&r.marker.startsWith(s.index+'-'));
  const delta=key=>Number(s.after.database[0][key])-Number(s.before.database[0][key]);
  return{index:s.index,worker:s.worker,nextPid:s.nextPid,buildId:s.buildId,samples:s.samples.map(x=>round(x.totalMs)),medianMs:round(median(s.samples.map(x=>x.totalMs))),ttfbMedianMs:round(median(s.samples.map(x=>x.ttfbMs))),serverMedianMs:round(median(r.map(x=>x.wallMs))),dbUnionMedianMs:round(median(r.map(x=>union(x.queries)))),nonDbMedianMs:round(median(r.map(x=>x.wallMs-union(x.queries)))),queryCounts:r.map(x=>x.queries.length),hostBefore:s.before.host,hostAfter:s.after.host,dbDelta:{commits:delta('xact_commit'),rollbacks:delta('xact_rollback'),diskBlocks:delta('blks_read'),cacheBlocks:delta('blks_hit'),tempFiles:delta('temp_files'),deadlocks:delta('deadlocks')},dbWaitsBefore:s.before.waits,dbWaitsAfter:s.after.waits,cpuProfile:requests.find(x=>x.kind==='CPU_PROFILE'&&x.marker===s.index+'-7')?.sampledMs};
 })};
}
writeFileSync(prefix+'-summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.series.map(s=>({series:s.index,worker:s.worker,median:s.medianMs,db:s.dbUnionMedianMs,nonDb:s.nonDbMedianMs,cpu:s.hostBefore.cpuPercent+'/'+s.hostAfter.cpuPercent}))])),null,2));
