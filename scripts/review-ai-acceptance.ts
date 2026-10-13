import {readFileSync,writeFileSync} from 'node:fs';
import {buildAiPageEvidence} from '../src/lib/ai/evidence';
import {DeepSeekProvider} from '../src/lib/ai/deepseek';
import {validateAiResult} from '../src/lib/ai/validator-v2';
import {AiError} from '../src/lib/ai/provider';
import {publicData} from '../src/lib/public-data';
import {db} from '../src/lib/db';
// Acceptance artifact, never application diagnostics/history. Fixed three user-authorized Pages.
const selected=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8')),results=[];
for(const p of selected){if(!p.page||process.argv[2]&&!process.argv[2].split(',').includes(p.case))continue;const input=await buildAiPageEvidence(p.page.id),start=performance.now();
 try{let response;for(let attempt=0;attempt<2;attempt++){try{response=await new DeepSeekProvider().analyzePage(input);break;}catch(e){if(attempt===0&&e instanceof AiError&&['NETWORK','TIMEOUT'].includes(e.code))continue;throw e;}}
  if(!response)throw new AiError('NETWORK');let result:unknown,status='PASS';
  try{result=validateAiResult(response.text,input);}catch(e){status=e instanceof AiError?e.code:'ERROR';try{result=JSON.parse(response.text);}catch{result={invalidJson:true};}}
  results.push({case:p.case,pageId:p.page.id,status,latencyMs:Math.round(performance.now()-start),result:publicData(result),evidence:input});
 }catch(e){results.push({case:p.case,pageId:p.page.id,status:e instanceof AiError?e.code:'ERROR',latencyMs:Math.round(performance.now()-start)});}
 console.log(JSON.stringify({case:p.case,status:results.at(-1)!.status,latencyMs:results.at(-1)!.latencyMs}));writeFileSync('test-results/sprint4-review-artifact.json',JSON.stringify(results,null,2));
}
await db.$disconnect();
