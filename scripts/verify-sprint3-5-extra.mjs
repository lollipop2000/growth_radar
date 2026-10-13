import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const results=[];
for(const [name,args] of [['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['tests',['--conditions=react-server','--import=tsx','--test','tests/*.test.ts']],['seo-actions regression',['--env-file=.env','--conditions=react-server','--import=tsx','scripts/acceptance-seo-actions.ts']]]){
 const r=spawnSync(process.execPath,args,{encoding:'utf8',env:process.env,maxBuffer:10000000});writeFileSync('test-results/sprint3-5-'+(name==='seo-actions regression'?'guard':name==='tests'?'unit':name)+'.log',(r.stdout??'')+(r.stderr??''));results.push({name,status:r.status===0?'PASS':'FAIL'});writeFileSync('test-results/sprint3-5-extra-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));if(r.status!==0)process.exit(1);
}
