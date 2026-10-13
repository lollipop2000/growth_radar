import {readFileSync,writeFileSync} from 'node:fs';
const file='.env';let contents=readFileSync(file,'utf8');
const values={AI_ENABLED:'true',DEEPSEEK_BASE_URL:'https://api.deepseek.com',DEEPSEEK_MODEL:'deepseek-flash',AI_TIMEOUT_MS:'60000',AI_MAX_OUTPUT_TOKENS:'6000'};
for(const [name,value] of Object.entries(values)){
  const pattern=new RegExp('^'+name+'=.*$','m');
  contents=pattern.test(contents)?contents.replace(pattern,name+'='+value):contents.trimEnd()+'\n'+name+'='+value+'\n';
}
if(!/^DEEPSEEK_API_KEY=/m.test(contents))contents=contents.trimEnd()+'\nDEEPSEEK_API_KEY=\n';
writeFileSync(file,contents);console.log('AI parameters configured; existing API key preserved, no secret printed.');
