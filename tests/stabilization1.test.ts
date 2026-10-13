import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerSubmission} from '../src/lib/scanner/submission';
import {matchUrl,urlMatcher} from '../src/lib/yandex/matching';
import {classifyQuery,querySummary} from '../src/lib/seo-actions/intent';
test('Unified Scanner submits technical scope and maps all supported presets/transports',()=>{
 for(const scope of ['ALL','UNMATCHED'])for(const preset of ['FULL','DIAGNOSTIC','TEST_ONE','TARGETED'])for(const transport of ['HTTP_BROWSER','HTTP_ONLY','BROWSER_ONLY']){const f=new FormData();for(const [k,v] of Object.entries({scanScope:'SOURCE',scope,preset,transport}))f.set(k,v);const p=scannerSubmission(f);assert.equal(p.source,scope);assert.equal(p.preset,preset);assert.equal(p.transport,transport);assert.equal(p.browserFallback,transport==='HTTP_BROWSER');assert.equal(p.mode,transport==='BROWSER_ONLY'?'BROWSER':'HTTP');}
 const f=new FormData();f.set('scanScope','SINGLE');assert.equal(scannerSubmission(f).single,true);f.set('scope','Все URL');assert.throws(()=>scannerSubmission(f));
});
test('Request matching index retains exact precedence, alias ambiguity, host and meaningful query semantics',()=>{
 const base='https://example.test/',pages=[{id:'a',normalizedUrl:base+'a',aliasesJson:[base+'old',base+'shared']},{id:'b',normalizedUrl:base+'b',aliasesJson:[base+'shared']},{id:'exact',normalizedUrl:base+'old',aliasesJson:[]}],match=urlMatcher(base,pages);
 for(const url of ['a/','b','old','shared','missing','a?filter=one','https://foreign.test/a','mailto:a@example.test'])assert.deepEqual(match(url),matchUrl(url,base,pages));
});
test('Request intent reuse preserves raw text and multi-tag classification',()=>{
 const rows=[' Купить масло 20л ','купить масло 20л','API SN SAE 5W-30','канистра 5 л'].map((query,i)=>({query,impressions:i+1,clicks:i,avgPosition:3})),summary=querySummary(rows);
 for(let i=0;i<rows.length;i++)assert.deepEqual({...summary.clusters[i],impressions:undefined,clicks:undefined,avgPosition:undefined},{...classifyQuery(rows[i].query),impressions:undefined,clicks:undefined,avgPosition:undefined});
});
