import {readFileSync,writeFileSync} from 'node:fs';
const id=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8'))[0].page.id;
const route='/pages/'+id+'?searchPeriod=M3';await(await fetch('http://127.0.0.1:3000'+route)).text();
const samples=[];for(let n=0;n<5;n++){const start=performance.now(),r=await fetch('http://127.0.0.1:3000'+route);await r.text();samples.push({ms:performance.now()-start,status:r.status});}
const ms=samples.map(r=>r.ms).sort((a,b)=>a-b),result={route,samples,min:ms[0],median:ms[2],mean:ms.reduce((a,b)=>a+b)/5,max:ms[4]};
writeFileSync('test-results/sprint4-page360-'+(process.argv[2]??'before')+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
