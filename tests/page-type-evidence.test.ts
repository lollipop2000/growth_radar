import test from 'node:test';
import assert from 'node:assert/strict';
import {mappedProductType} from '../src/lib/scanner/page-type';
import type {ProductMapping} from '../src/lib/business/typed-import';
import type {ContentSignals} from '../src/lib/scanner/content';
const url='https://fixture.test/catalog/detail/',h1='Test Oil 20 л',products:ProductMapping[]=[{sku:'123456789012',productGroup:'A',productName:h1,rawUrl:url,active:true}],signals:ContentSignals={visibleText:'',topText:h1+' 123456789012 Описание Характеристики Документы',commercial:{price:{present:true,evidence:'100 ₽'},availability:{present:true,evidence:'В наличии'}}};
test('mapped detail evidence classifies product without relying on URL slug',()=>assert.equal(mappedProductType(url,[],products,h1,signals),'product'));
test('ambiguous groups, name mismatch, list/filter template and missing evidence remain unclassified',()=>{
 for(const [u,ps,h,s] of [[url,[...products,{...products[0],productGroup:'B'}],h1,signals],[url,products,'Other',signals],[url,products,h1,{...signals,topText:'Каталог продукции'}],[url+'?filter=y',products,h1,signals],['https://fixture.test/catalog/filter/apply/',products,h1,signals],[url,products,h1,null],[url,products.map(p=>({...p,active:false})),h1,signals]] as const)assert.equal(mappedProductType(u,[],[...ps],h,s),null);
});
test('observed alias mapping and multiple SKU of one group are valid',()=>assert.equal(mappedProductType(url,['https://fixture.test/catalog/123/'],products.map(p=>({...p,rawUrl:'https://fixture.test/catalog/123/'})),h1,signals),'product'));
test('numeric SKU display padding is evidence only and never changes registry identity',()=>{const ps=products.map(p=>({...p,sku:'123456789'})),s={...signals,topText:h1+' 000123456789 Описание Характеристики Документы'};assert.equal(mappedProductType(url,[],ps,h1,s),'product');assert.equal(ps[0].sku,'123456789');assert.equal(mappedProductType(url,[],ps,h1,{...s,topText:h1+' 99123456789 Описание Характеристики Документы'}),null);assert.equal(mappedProductType(url,[],products.map(p=>({...p,sku:'0'})),h1,signals),null);});
