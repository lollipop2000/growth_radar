import test from 'node:test';
import assert from 'node:assert/strict';
import {seoEligibility,searchUrlKind,modernSignals} from '../src/lib/seo-actions/eligibility';
import {scannerSubmission} from '../src/lib/scanner/submission';
const url='https://fixture.invalid/catalog/product/';
const good={statusCode:200,outcome:'OK',source:'BROWSER',canonical:url,robots:'index,follow',indexable:true};
test('indexability uses evidence; WAF and missing signals stay uncertain',()=>{
 assert.equal(seoEligibility(url,undefined).status,'UNCERTAIN');
 assert.equal(seoEligibility(url,{...good,statusCode:403,outcome:'BLOCKED_BY_WAF'}).status,'UNCERTAIN');
 assert.equal(seoEligibility(url,{...good,statusCode:404}).status,'NOT_ELIGIBLE');
 assert.equal(seoEligibility(url,{...good,robots:'noindex'}).status,'NOT_ELIGIBLE');
 assert.equal(seoEligibility(url,{...good,canonical:'https://fixture.invalid/other/'}).status,'NOT_ELIGIBLE');
 assert.equal(seoEligibility(url,good).status,'ELIGIBLE');
 assert.equal(seoEligibility(url,{...good,source:'IMPORT',canonical:null,robots:null}).status,'UNCERTAIN');
});
test('Search classification preserves document, facet, legacy and malformed distinctions',()=>{
 assert.equal(searchUrlKind('https://fixture.invalid/catalog/14134/'),'LEGACY_NUMERIC');
 assert.equal(searchUrlKind('https://fixture.invalid/file.PDF?download=1'),'DOCUMENT');
 assert.equal(searchUrlKind('https://fixture.invalid/catalog/filter/oil/'),'QUERY_FILTER');
 assert.equal(searchUrlKind(url),'OTHER_HTML');
 assert.equal(searchUrlKind('javascript:alert(1)'),'MALFORMED_OTHER');
});
test('legacy text does not prove modern content signals',()=>{
 assert.equal(modernSignals({wordCount:400}),false);
 assert.equal(modernSignals({visibleText:'text',topText:'text',commercial:{}}),true);
});
test('a reset Search form must never fall back to a whole-site scan',()=>{
 const f=new FormData();f.set('searchScope','TOP100');f.set('scanScope','SITE');f.set('scope','UNMATCHED');
 assert.throws(()=>scannerSubmission(f),/Search source/);
 f.set('scanScope','SOURCE');assert.throws(()=>scannerSubmission(f),/Search source/);
 for(const source of ['SEO_RESCAN','SEARCH_UNMATCHED']){f.set('scope',source);assert.equal(scannerSubmission(f).source,source);assert.equal(scannerSubmission(f).scope,'SOURCE');}
});
