import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from '../src/lib/seo-actions/intent';
import {normalizeTechnicalToken} from '../src/lib/seo-actions/technical-token';
test('SAE formatting equivalence preserves grades and original inputs',()=>{
 for(const grade of ['0w20','0w30','0w40','5w20','5w30','5w40','10w30','10w40','15w40','20w50','0w8','75w140']){
  const [winter,summer]=grade.split('w');
  for(const spelling of [grade,grade.toUpperCase(),`${winter}W-${summer}`,`${winter}w ${summer}`,`${winter} W - ${summer}`]){
   assert.equal(normalizeTechnicalToken(spelling),`${winter}w-${summer}`);
   assert.equal(contains(`Масло SAE ${spelling} для двигателя`,grade),true);
  }
 }
 assert.equal(contains('5W-30','5w40'),false);assert.equal(contains('10W-30','10w40'),false);
 assert.equal(contains('15W-40','5w40'),false);assert.equal(contains('5W-400','5w40'),false);
 assert.equal(contains('X5W-40','5w40'),false);
 assert.equal(contains('SAE5W-40.','sae 5w40'),true);
 assert.equal(contains('5W-40, масло','5w40'),true);
 assert.equal(contains('5W-40.5','5w40'),false);
});
test('packaging equivalence keeps volume and mass separate',()=>{
 for(const n of [4,20,205])for(const s of [`${n}л`,`${n} л`,`${n}l`,`${n} l`,`${n}.0 л`,`${n},0 л`])assert.equal(contains(s,`${n} л`),true);
 assert.equal(contains('205 л','20 л'),false);assert.equal(contains('20 кг','20 л'),false);
 assert.equal(contains('20 l','20 kg'),false);assert.equal(contains('20 kg','20 кг'),true);
 assert.equal(contains('120 л','20 л'),false);assert.equal(contains('4.5 л','5 л'),false);
 assert.equal(contains('модель 20lx','20 л'),false);
 assert.equal(contains('Масло 20 л','Масло 20л'),true);
 assert.equal(contains('Oil 5W-40 Канистра 4 л','Oil 5w40 Канистра 4л'),true);
});
test('contextual integral grades only; no fuzzy or bare-number equivalence',()=>{
 for(const value of ['ISO VG 46','ISO VG 46.0','ISO VG 46,0'])assert.equal(contains(value,'iso vg 46'),true);
 assert.notEqual(normalizeTechnicalToken('46'),normalizeTechnicalToken('46.0'));
 assert.equal(contains('HVLP 32','HLP 32'),false);assert.equal(contains('HLP 32','HVLP 32'),false);
 assert.equal(contains('GL-5','GL-4'),false);assert.equal(contains('GL-40','GL-4'),false);
 assert.equal(contains('ATF VI','ATF III'),false);assert.equal(contains('API SN','api sn'),true);
 assert.equal(contains('ISO VG 46.5','ISO VG 46'),false);
});
