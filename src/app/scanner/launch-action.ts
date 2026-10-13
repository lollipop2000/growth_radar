'use server';
import {revalidatePath} from 'next/cache';
import {scannerSubmission} from '@/lib/scanner/submission';
import {createScan} from '@/lib/scanner/service';
import {createCoverageScan,coveragePreview} from '@/lib/scanner/coverage';
import {scanTopUnmatched} from '@/lib/yandex/targeted';
import type {Transport} from '@/lib/scanner/diagnostics';
import {searchScanPreview,createSearchScan,type SearchScanSource} from '@/lib/scanner/search-scope';
import type {SearchCandidate} from '@/lib/scanner/search-scope';
export type LaunchState={message:string;preview?:{source:string;scope:string;rows:SearchCandidate[];batches:number;period:{from:string;to:string};summary:Record<string,unknown>}};
export async function launchScanner(previous:LaunchState,form:FormData):Promise<LaunchState>{
 try{const p=scannerSubmission(form);if(p.scope==='SOURCE'&&['SEO_RESCAN','SEARCH_UNMATCHED'].includes(p.source)){
 const scope=String(form.get('searchScope')??'TOP100');
 if(form.get('operation')==='PREVIEW'){const preview=await searchScanPreview(p.source as SearchScanSource,scope);return {message:`Search scope: ${preview.rows.length} URL, ${preview.batches} пачек по ≤50. Запуск каждой пачки только вручную.`,preview};}
 if(!previous.preview||previous.preview.source!==p.source||previous.preview.scope!==scope)throw Error('Сначала выполните preview выбранного Search source.');
 const scan=await createSearchScan(p.source as SearchScanSource,scope,previous.preview.rows.map(r=>r.url),Number(form.get('searchBatch')??1),p.transport as Transport,p.delayMs);
 revalidatePath('/scanner');return {...previous,message:`Задание ${scan.id} создано. Следующие пачки не запускаются автоматически.`};
 }if(form.get('operation')==='PREVIEW'){
 if(p.scope!=='SOURCE')return {message:'Проверьте URL и ограничения, затем запустите сканирование.'};
 const v=await coveragePreview(p.period,p.source,p.batchSize,p.rescan);return {message:`Источник: Метрика · ${p.source==='ALL'?'все URL':'несопоставленные'} · очередь: ${v.queue.length} URL · исключено: ${v.excluded.length} · покрытие трафика: ${v.before.coverage?.toFixed(2)??'—'}%.`};}
 const scan=p.scope==='SOURCE'?(p.preset==='TARGETED'?await scanTopUnmatched(p.limit,{mode:p.mode,delayMs:p.delayMs,browserFallback:p.browserFallback}):await createCoverageScan(p.period,p.source,p.batchSize,p.rescan,undefined,undefined,{transport:p.transport as Transport,delayMs:p.delayMs,diagnosticLimit:p.preset==='TEST_ONE'?1:p.preset==='DIAGNOSTIC'?p.limit:undefined,testUrl:p.preset==='TEST_ONE'?p.testUrl:undefined})):await createScan({mode:p.mode,maxPages:p.maxPages,concurrency:Number(form.get('concurrency')||1),delayMs:p.delayMs,seeds:p.seeds,excludes:p.excludes,single:p.single,browserFallback:p.browserFallback},p.single?{searchTargeted:{source:'TEST_ONE',scope:'SINGLE',batch:1,selected:p.seeds.slice(0,1),state:'PENDING'}}:undefined);
 revalidatePath('/scanner');return {message:`Задание ${scan.id} создано. Прогресс и управление — на этой странице.`};
 }catch(error){return {message:error instanceof Error&&/URL|Search|preview|Period|Scope|Batch|Delay|Max|concurrency|Seeds|Сначала|Другое|Некоррект|Diagnostic|Тест|Нет доступных|INVALID_TARGET|NO_SAFE|NO_LANDING/.test(error.message)?error.message:'Не удалось создать очередь. Проверьте настройки источника и БД.'};}
}
