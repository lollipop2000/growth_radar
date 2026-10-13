import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {crawl} from '../src/lib/scanner/engine';
import {scanOptions} from '../src/lib/scanner/options';
import {BrowserReader,type BrowserResult} from '../src/lib/scanner/browser';
import {emptyResult,type PageResult} from '../src/lib/scanner/model';
import {unresolvedWaf} from '../src/lib/scanner/diagnostics';
import {saveResultIsolated} from '../src/lib/scanner/save-result';
test('HTTP 403 with Browser 404 is a page error; next URLs continue, challenge still stops',async()=>{
 const server=createServer((req,res)=>{if(req.url==='/robots.txt'){res.end('User-agent: *');return;}res.writeHead(403);res.end('blocked');});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as any).port}/`;
 class Reader extends BrowserReader{async close(){}async read(url:string):Promise<BrowserResult>{const dead=url.endsWith('/dead/'),blocked=url.endsWith('/challenge/');return {html:'<title>Fixture</title><h1>Fixture</h1>',finalUrl:url,statusCode:dead?404:blocked?403:200,contentType:'text/html',responseTimeMs:1,outcome:blocked?'BLOCKED_BY_WAF':dead?'ERROR':'OK',error:dead?'HTTP 404':null,redirects:[]};}}
 try{const rows:PageResult[]=[];const summary=await crawl(base,scanOptions({mode:'HTTP',maxPages:4,seeds:['dead/','good/','challenge/','after/'].map(p=>base+p),seedOnly:true,browserFallback:true,delayMs:1000}),new AbortController().signal,async r=>{rows.push(r);},async()=>{},new Reader());assert.equal(rows.length,3);assert.equal(rows[0].statusCode,404);assert.equal(rows[0].outcome,'ERROR');assert.equal(unresolvedWaf(rows[0]),false);assert.equal(rows[1].outcome,'OK');assert.equal(unresolvedWaf({...rows[1],outcome:'ERROR'}),false);assert.equal(summary.blocked,true);assert.equal(rows[2].outcome,'BLOCKED_BY_WAF');}finally{server.close();}
});
test('a reader exception becomes one page error and the following URL still runs',async()=>{
 class Reader extends BrowserReader{async close(){}async read(url:string):Promise<BrowserResult>{if(url.endsWith('/bad'))throw new Error('sensitive detail must not be logged');return {html:'<h1>OK</h1>',finalUrl:url,statusCode:200,contentType:'text/html',responseTimeMs:1,outcome:'OK',error:null,redirects:[]};}}
 const rows:PageResult[]=[];const s=await crawl('http://127.0.0.1:48990/',scanOptions({mode:'BROWSER',maxPages:2,single:false,seedOnly:true,seeds:['http://127.0.0.1:48990/bad','http://127.0.0.1:48990/good'],delayMs:1000}),new AbortController().signal,async r=>{rows.push(r);},async()=>{},new Reader());assert.equal(s.scanned,2);assert.equal(s.errors,1);assert.equal(rows[1].outcome,'OK');assert.ok(!rows[0].error?.includes('sensitive'));
});
test('page-specific save failure stores a clean error result; database failure stops safely',async()=>{
 const page={...emptyResult('http://fixture.invalid/page/','HTTP'),statusCode:200};let calls=0;
 for(const code of ['P2000','P2028']){calls=0;await saveResultIsolated('scan','site',page,async(_s,_t,r)=>{calls++;if(calls===1)throw {code};assert.equal(r.outcome,'ERROR');});assert.equal(calls,2);assert.equal(page.outcome,'ERROR');}
 calls=0;await assert.rejects(()=>saveResultIsolated('scan','site',page,async()=>{calls++;throw {code:'P1001'};}));assert.equal(calls,1);
});
