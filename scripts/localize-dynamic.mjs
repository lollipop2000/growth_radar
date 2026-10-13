import ts from 'typescript';import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import path from 'node:path';import {fragments} from './ui-translations.mjs';
writeFileSync('src/lib/i18n/fragments.ts',`export const uiFragments: [string,string][] = ${JSON.stringify([...fragments,['token','токен'],['OAuth scopes','разрешения авторизации'],['rate limit','лимит запросов'],['backoff','задержкой'],['checkpoint','сохранённый этап'],['Sync','Синхронизация'],['Priority job','Приоритетное задание'],['Targeted scan','Выборочная проверка'],['reaches','достижения'],['Goal','Цель'],['Host','Сайт'],['Counter','Счётчик'],['timeout stage','этап превышения времени'],['status','статус'],['batches','пачек'],['matched','сопоставлено'],['unmatched','не сопоставлено'],['normalized','нормализованные'],['striking distance','близость к первым позициям'],['Title','Заголовок'],['Description','Описание'],['H1','Основной заголовок'],['H2','Подзаголовки'],['Robots','Правила индексации']])};`);
const files=[];function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.tsx'))files.push(p);}}walk('src/app');walk('src/components');
for(const f of files){let input=readFileSync(f,'utf8');const sf=ts.createSourceFile(f,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), edits=[];
 function visit(n){if(ts.isJsxExpression(n)&&n.expression&&!ts.isJsxAttribute(n.parent)){const e=n.expression,raw=e.getText(sf);let wrap=null;
  if(ts.isPropertyAccessExpression(e)&&['message','inclusionReason','pauseReason','lastError','error'].includes(e.name.text)||ts.isIdentifier(e)&&['title','error'].includes(raw))wrap='ui';
  else if(ts.isConditionalExpression(e)||ts.isBinaryExpression(e)&&e.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken){const props=raw.match(/(?:status|outcome|source|mode|matchStatus|scope)/);if(props||ts.isConditionalExpression(e)&&['true','false'].every(()=>true)&&ts.isStringLiteral(e.whenTrue)&&ts.isStringLiteral(e.whenFalse))wrap='ui';}
  let hasJsx=false;function hasNode(x){if(ts.isJsxElement(x)||ts.isJsxSelfClosingElement(x)||ts.isJsxFragment(x))hasJsx=true;ts.forEachChild(x,hasNode);}hasNode(e);
  if(wrap&&!hasJsx){edits.push({start:e.getStart(sf),end:e.end,text:`${wrap}(${raw})`});return;}
 }ts.forEachChild(n,visit);}visit(sf);
 for(const e of edits.sort((a,b)=>b.start-a.start))input=input.slice(0,e.start)+e.text+input.slice(e.end);
 if(edits.length&&!/import\s*\{[^}]*\bui\b[^}]*\}\s*from\s*["'][^"']*i18n\/ru/.test(input))input=input.replace(/import\s*\{([^}]*\bt\b[^}]*)\}\s*from\s*(["'][^"']*i18n\/ru["']);/,(_,names,source)=>`import {${names}, ui } from ${source};`);
 writeFileSync(f,input);
}
