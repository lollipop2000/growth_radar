import test from 'node:test';
import assert from 'node:assert/strict';
import {observedRedirect,redirectHops} from '../src/lib/scanner/redirects';
const source='https://fixture.invalid/catalog/14134/',final='https://fixture.invalid/catalog/current/',base='https://fixture.invalid/';
const snapshot={requestedUrl:source,finalUrl:final,statusCode:200,outcome:'OK',source:'HTTP',redirectsJson:[{sourceUrl:source,targetUrl:final,statusCode:301}]};
test('only a successful same-site observed chain qualifies as a redirect alias',()=>{
 assert.ok(observedRedirect(snapshot,base));assert.ok(observedRedirect({...snapshot,redirectsJson:[{sourceUrl:source,targetUrl:final,statusCode:302}]},base));
 assert.equal(redirectHops(snapshot.redirectsJson)[0].statusCode,301);
 for(const outcome of ['ERROR','BLOCKED_BY_WAF','AUTH_REQUIRED'])assert.equal(observedRedirect({...snapshot,outcome},base),false);
 assert.equal(observedRedirect({...snapshot,statusCode:404},base),false);
 assert.equal(observedRedirect({...snapshot,source:'IMPORT'},base),false);
 assert.equal(observedRedirect({...snapshot,redirectsJson:[]},base),false);
 assert.equal(observedRedirect({...snapshot,finalUrl:'https://other.invalid/'},base),false);
 assert.equal(observedRedirect({...snapshot,redirectsJson:[{sourceUrl:source,targetUrl:base+'middle/',statusCode:301},{sourceUrl:base+'unrelated/',targetUrl:final,statusCode:301}]},base),false);
});
test('legacy observed strings remain evidence with unknown hop status, never a guessed 301',()=>{
 const old={...snapshot,redirectsJson:[source]};assert.ok(observedRedirect(old,base));assert.deepEqual(redirectHops(old.redirectsJson),[]);
});
