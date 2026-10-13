import ts from 'typescript';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {translations, fragments} from './ui-translations.mjs';
const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.tsx'))files.push(p);}}walk('src/app');walk('src/components');
const texts=new Set();
for(const file of files){const input=readFileSync(file,'utf8'),sf=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isJsxText(n)){const text=n.text.replace(/\s+/g,' ').trim();if(/[a-zа-я]/i.test(text))texts.add(text);}if(ts.isStringLiteral(n)&&((ts.isJsxAttribute(n.parent)&&['placeholder','title','aria-label','alt'].includes(n.parent.name.text))||ts.isJsxExpression(n.parent)&&!ts.isJsxAttribute(n.parent.parent))&&/[a-zа-я]/i.test(n.text))texts.add(n.text);ts.forEachChild(n,visit);}visit(sf);}
writeFileSync('test-results/localization-inventory.json',JSON.stringify([...texts].sort(),null,2));
console.log([...texts].filter(s=>/[a-z]/i.test(s)).join('\n'));
if(process.argv.includes('--apply')){
  const messages={};const all=new Set(texts);
  for(const file of files){const input=readFileSync(file,'utf8'),sf=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function collect(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='t'&&ts.isStringLiteral(n.arguments[0]))all.add(n.arguments[0].text);ts.forEachChild(n,collect);}collect(sf);}
  for(const text of all){let result=translations[text]??text;if(!translations[text])for(const [from,to] of fragments)result=result.replaceAll(from,to);messages[text]=result;}
  writeFileSync('src/lib/i18n/messages.ts',`// Central Russian UI messages. Technical values in storage are unchanged.\nexport const messages: Record<string,string> = ${JSON.stringify(messages,null,2)};\n`);
  for(const file of files){let input=readFileSync(file,'utf8');const sf=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
    function visit(n){
      if(ts.isJsxText(n)){const text=n.text.replace(/\s+/g,' ').trim();if(/[a-zа-я]/i.test(text))edits.push({start:n.getStart(sf),end:n.end,text:`{t(${JSON.stringify(text)})}${/\s$/.test(n.text)&&!/\n/.test(n.text)?'{" "}':''}`});}
      else if(ts.isStringLiteral(n)&&ts.isJsxAttribute(n.parent)&&['placeholder','title','aria-label','alt'].includes(n.parent.name.text)&&/[a-zа-я]/i.test(n.text))edits.push({start:n.getStart(sf),end:n.end,text:`{t(${JSON.stringify(n.text)})}`});
      else if(ts.isJsxExpression(n)&&n.expression&&!ts.isJsxAttribute(n.parent)) {const e=n.expression,raw=e.getText(sf);if(ts.isStringLiteral(e)&&/[a-zа-я]/i.test(e.text)||ts.isIdentifier(e)&&['label','status','source'].includes(raw)||ts.isPropertyAccessExpression(e)&&['status','source','pageType','outcome','mode','matchStatus','matchReason','reason','type','classification'].includes(e.name.text)) {edits.push({start:e.getStart(sf),end:e.end,text:`t(${raw})`});return;}}
      ts.forEachChild(n,visit);
    }visit(sf);for(const e of edits.sort((a,b)=>b.start-a.start))input=input.slice(0,e.start)+e.text+input.slice(e.end);
    if(edits.length&&!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*["'][^"']*i18n\/ru/.test(input)){const prefix=input.startsWith('"use client";')?'"use client";\n':'';if(prefix)input=input.slice('"use client";'.length);input=prefix+'import { t } from "@/lib/i18n/ru";\n'+input;}
    writeFileSync(file,input);
  }
}
