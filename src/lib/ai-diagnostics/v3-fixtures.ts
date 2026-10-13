import {catalogDiagnosticFixture} from './fixtures';
import type {Recommendation} from '../seo-review/v3/contract';
/** Synthetic, not a replay or repair of protected model output. */
export function catalogV3Fixture(){
 const f=catalogDiagnosticFixture(),{claims,evidenceIds,...base}=f.proposals[0];
 const q=f.input.search.queries.find(e=>(e.value as {query:string}).query===base.targetQueries![0])!;
 const r:Recommendation={...base,evidenceReferences:[{evidenceId:f.input.content.title.id,fieldPath:'value',purpose:'OBSERVE'},{evidenceId:f.input.content.excerpts.id,fieldPath:'value[0].text',purpose:'OBSERVE'},{evidenceId:q.id,fieldPath:'value.query',purpose:'OBSERVE'}],statements:[{kind:'GROWTH_HYPOTHESIS',text:'Нейтральный вариант заголовка требует проверки широты ассортимента.',references:[]}]};
 return {input:f.input,proposals:[r],raw:JSON.stringify({summary:{overallAssessment:'SYNTHETIC ONLY',strengths:[],keyOpportunities:[]},recommendations:[r],limitations:[]})};
}
