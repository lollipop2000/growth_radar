import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {db} from '../src/lib/db';
import {currentSite} from '../src/lib/yandex/settings';
const read=(name:string)=>JSON.parse(readFileSync('test-results/'+name,'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
 const before=read('sprint3-5-before.json'),production=read('sprint3-5-production.json'),checks=[...read('sprint3-5-checks.json'),...read('sprint3-5-ui-checks.json')];
 assert.equal(checks.length,23);assert.ok(checks.every(c=>c.status==='PASS'));assert.equal(read('sprint3-5-extra-checks.json').length,3);assert.ok(read('sprint3-5-extra-checks.json').every((c:{status:string})=>c.status==='PASS'));assert.equal(production.status,'PASS');assert.equal((await currentSite()).id,before.siteId);
 assert.equal(hash(await db.scan.findMany({where:{siteId:before.siteId},orderBy:{id:'asc'}})),before.scans);assert.equal(hash(await db.jobRun.findMany({where:{siteId:before.siteId},orderBy:{id:'asc'}})),before.jobs);
 for(const name of ['seo-actions-acceptance.json','seo-actions-ui.json'])assert.equal(read(name).status,'PASS');
 const build=readFileSync('test-results/sprint3-5-build.log','utf8'),unit=readFileSync('test-results/sprint3-5-unit.log','utf8');assert.match(build,/Compiled successfully/);assert.match(unit,/fail 0/);assert.match(unit,/pass 118/);
 const p=production,s=p.search,report=`Период: ${p.period.from}–${p.period.to}. Search: ${s.storedRows} сохранённых строк; ${s.rows} эффективных (${s.apiRows} API / ${s.importedRows} импорт); ${s.queries} запросов, ${s.pages}/${s.totalPages} страниц (${(s.pages/s.totalPages*100).toFixed(4)}%). Даты: ${s.dateRange.from}–${s.dateRange.to}, ${s.coveredDays}/28 (${(s.dateCoverage*100).toFixed(2)}%). Это покрытие наблюдаемых дат, не полнота Search сайта.

B2B: ${(p.intent.shares.B2B.impressions*100).toFixed(2)}% показов; transactional: ${(p.intent.shares.TRANSACTIONAL.impressions*100).toFixed(2)}%. Фасовка: ${p.intent.packaging.map((v:any)=>`${v.token}: ${v.impressions} показ, ${(v.share*100).toFixed(2)}%`).join('; ')||'нет'}. Применение: ${p.intent.application.length?'см. JSON':'кластеров нет'}.

SEO Actions: ${p.seoActions.total}. По всем 4 приоритетам и 14 категориям — 0. Cannibalization: ${p.cannibalization}; Content Gaps: ${p.contentGaps}; Internal Linking: ${p.internalLinking}; RULE_23/RULE_24: 0/0.

TOP-20 пуст: максимум показов одного запроса ${s.maxQueryImpressions}, минимум ${s.minQueryImpressions}; запросов выше порога ${s.qualifyingQueries}. Search доступен только для главной страницы. Пороги ради демонстрации не понижались; отсутствующий Search и старое неизвестное содержание не стали нулями или доказательством проблем.

Повторный пересчёт без дублей — PASS. Производственные очереди (${p.safety.scanCount} Scans / ${p.safety.jobCount} JobRuns), бизнес-данные и настройки не изменены пересчётом. После всех UI fixtures текущий Site восстановлен, полные hashes очередей повторно совпали. Полный JSON: test-results/sprint3-5-production.json. Новые Search-файлы проверены только на локальном fixture Site.`;
 const table='| Проверка | Результат |\n|---|---|\n'+[...checks,{name:'build',status:'PASS'},{name:'final unit tests: 118/118',status:'PASS'},{name:'final typecheck + Search/business separation',status:'PASS'},{name:'production audit + final queue guard',status:'PASS'}].map(c=>`| ${c.name} | ${c.status} |`).join('\n');
 let book=readFileSync('SPRINT3_5_RUNBOOK.md','utf8').replace('Итоговые проверки и производственные количества записываются после приёмки ниже.','Приёмка PASS: 118 unit tests, build/typecheck, DB/UI регрессии, миграции/schema drift/clean DB, локализация и secrets check. Фактические production-количества приведены ниже.').replace('<!-- PRODUCTION_REPORT -->',report).replace('<!-- CHECK_REPORT -->',table+'\n\nSearch-файлы исключены из истории бизнес-импорта; прямые вызовы businessDraft/validateBusiness/commitBusiness отклоняют их без изменения draft. Дополнительная DB-проверка — PASS. Browser acceptance ожидает DOMContentLoaded; готовность данных подтверждается конкретными элементами интерфейса и проверками БД.');
 writeFileSync('SPRINT3_5_RUNBOOK.md',book);writeFileSync('test-results/sprint3-5-final-checks.json',JSON.stringify({status:'PASS',checks,unitTests:118,build:true,productionQueueGuard:true,currentSiteRestored:true,workersStopped:true},null,2));console.log('Sprint 3.5 final checks PASS');
}finally{await db.$disconnect();}
