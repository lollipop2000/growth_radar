import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const pages=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8'));
const browser=await chromium.launch({headless:true}),results=[];
try {for(const selected of pages){
 if(!selected.page){results.push({...selected,status:'MISSING_PAGE'});continue;}
 const tab=await browser.newPage();let actionId;
 tab.on('request',r=>{const id=r.headers()['next-action'];if(id)actionId=id;});
 await tab.goto('http://127.0.0.1:3000/pages/'+selected.page.id+'?searchPeriod=M3',{timeout:60000});
 const panel=tab.locator('[data-ai-analysis]');const before=await panel.getAttribute('data-ai-status');
 if(before!=='READY'){results.push({...selected,status:before});await tab.close();continue;}
 const start=performance.now();await panel.getByRole('button',{name:'Проанализировать страницу'}).click();
 await tab.waitForFunction(()=>['SUCCESS','ERROR'].includes(document.querySelector('[data-ai-analysis]')?.getAttribute('data-ai-status')),{},{timeout:180000});
 const status=await panel.getAttribute('data-ai-status');
 const recommendations=await panel.locator('article').evaluateAll(nodes=>nodes.map(n=>({title:n.querySelector('h4')?.textContent,text:n.textContent,evidence:[...n.querySelectorAll('details')].map(d=>({id:d.querySelector('summary')?.textContent,value:d.querySelector('pre')?.textContent}))})));
 results.push({...selected,status,latencyMs:Math.round(performance.now()-start),recommendations,output:await panel.innerText()});
 console.log(JSON.stringify({case:selected.case,pageId:selected.page.id,status,latencyMs:results.at(-1).latencyMs,recommendations:recommendations.length}));
 writeFileSync('test-results/sprint4-production-local-ui.json',JSON.stringify(results,null,2));
 if(selected.case==='A'&&actionId){
   const invalid=await tab.request.post('http://127.0.0.1:3000/pages/'+selected.page.id,{headers:{'Next-Action':actionId,'Content-Type':'text/plain;charset=UTF-8',Origin:'http://127.0.0.1:3000'},data:JSON.stringify(['https://random-site.invalid/'])});
   const body=await invalid.text();if(!body.includes('INVALID_PAGE'))throw new Error('Arbitrary URL server action guard failed');
   const missing=await tab.request.post('http://127.0.0.1:3000/pages/'+selected.page.id,{headers:{'Next-Action':actionId,'Content-Type':'text/plain;charset=UTF-8',Origin:'http://127.0.0.1:3000'},data:JSON.stringify(['nonexistentpagefixture'])});
   if(!(await missing.text()).includes('INVALID_PAGE'))throw new Error('Missing Page guard failed');
   writeFileSync('test-results/sprint4-action-guards.json',JSON.stringify({arbitraryUrl:'PASS',missingPage:'PASS'},null,2));
 }
 await tab.close();
 }}finally{await browser.close();}
if(results.some(r=>r.status!=='SUCCESS'))process.exitCode=1;
