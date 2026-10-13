import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
globalThis.fetch=async()=>{throw Error('REPORT_NETWORK_FORBIDDEN');};
try{
 const ledger=read('test-results/sprint5-1-live-2026-10-09.json'),r=ledger.results[0],p=await buildPageSeoReviewInput(ledger.pages.B.pageId);
 assert.equal(createHash('sha256').update(JSON.stringify(p)).digest('hex'),ledger.pages.B.inputHash);
 const safeEvidence={page:p.page,period:p.search.period,summary:p.search.summary,queries:p.search.queries,content:Object.fromEntries(['title','description','h1'].map(k=>[k,p.content[k]]))};
 writeFileSync('test-results/sprint5-1-live-B-evidence.json',JSON.stringify(safeEvidence,null,2));
 const before=read('test-results/sprint4-page360-sprint5-1-live-before.json'),after=read('test-results/sprint4-page360-sprint5-1-live-after.json');
 const lines=['# Sprint 5.1 — Live revalidation · 09.10.2026','',
 '## Статус','',
 '**LIVE REVALIDATION FAIL / READY WITH FIXES.** Главный сценарий B не дал ни одной принятой рекомендации. Серия остановлена после единственного вызова. A и E не запускались. Продуктовый PASS не объявлен; offline PASS не заменяет live-полезность.',
 '', '## Ledger и ограничения','',
 `Новый ledger: test-results/sprint5-1-live-2026-10-09.json. Максимум 3 новых платных вызова; использован **${ledger.totalCalls}**, retries **${ledger.retries}**, исходящих запросов **${r.outgoingRequests}**, не использовано **2**. halt=true; stopReason=${ledger.stopReason}. Старые Sprint 4/5 ledgers сохранены, их остатки не переиспользованы. Ни этот остановленный ledger, ни его остаток автоматически продолжаться не будут.`,
 '', `Model **${ledger.model}**, prompt **${ledger.prompt}**. Единственный POST выполнен штатным provider. Harness допускает ровно один HTTP-запрос за процесс только к настроенному chat/completions; reservation записана до вызова, повторные шаги запрещены. Между preflight и finish hashes кода, provider, guards, ENV, старых ledgers и десяти таблиц проверены; профиль B совпал с preflight hash.`,
 '', '## Сценарии','',
 '| Case | Calls | Generated | Accepted | Rejected | Review |',
 '| --- | ---: | ---: | ---: | ---: | --- |',
 `| B /catalog/ | 1 | ${r.review.validation.generated} | ${r.review.validation.accepted} | ${r.review.validation.rejected} | FAIL: нет полезного принятого результата |`,
 '| A товар | 0 | N/A | N/A | N/A | NOT RUN: B FAIL |',
 '| E главная | 0 | N/A | N/A | N/A | NOT RUN: B FAIL |',
 '', '## Полный текст принятых рекомендаций и содержательный review','',
 '**Принятых рекомендаций нет (0), включая NEEDS_REVIEW и SUPPORTED.** Поэтому нет принятого текста, предлагаемого изменения, placement или evidence IDs рекомендации, которые можно честно предъявить SEO-специалисту. READY_CHANGE=0, GROWTH_HYPOTHESIS=0, DATA_CHECK=0. Отклонённые тексты не сохранялись и не включены в отчёт.',
 '', 'Оценка B: **FAIL**. Требовалась хотя бы одна practically useful READY_CHANGE/GROWTH_HYPOTHESIS. Пустой принятый результат этому условию не соответствует. Поэлементный содержательный review принятых карточек неприменим: карточек нет. Это оценка Codex по фактическому результату, а не независимая подпись human reviewer. Judge API не применялся.',
 '', '## Диагностика отклонений','',
 '| Proposal index (1-based) | Все проваленные условия |', '| ---: | --- |'];
 for(const d of r.review.validation.decisions)lines.push(`| ${d.index+1} | ${d.reasonCodes.join(', ')} |`);
 lines.push('',
 'Частоты: FACT_VALUE_MISMATCH — 4 items; UNBOUND_ABSENCE_CLAIM — 3; INVENTED_NUMBER — 2; UNSUPPORTED_CTR — 2. Это 11 срабатываний в 5 items, а не 11 рекомендаций.',
 '', 'Что установлено кодом: структурный VALUE не совпал с registry по точным типам/значениям/структуре; отсутствие в свободном тексте не было связано с допустимым absence claim; в тексте появились числовые токены вне cited evidence; CTR-формулировка попала под запрет вывода о низком CTR без benchmark.',
 '', 'Границы диагностики: полный отклонённый текст/claim не хранится. Нельзя указать конкретную отличающуюся цифру, поле или фразу, объявить все отказы доказанными галлюцинациями либо исключить semantic false positive (например, отрицательную оговорку о CTR). Порядок ключей уже не влияет на сравнение; это не доказательство того, какой именно ключ/тип отличался в этой попытке. QUERY_NOT_CITED, UNKNOWN_TARGET_URL и UNSAFE_TEXT в этой серии не сработали, но это не доказывает исправление всех возможных случаев.',
 '', 'Без изменения guards/prompt/model/data нельзя получить другую попытку в этой серии. Серия остановлена; новые платные генерации не выполнялись.',
 '', '## Исходные Search evidence и content','',
 `Page ${p.page.currentUrl}; pageType=${p.page.pageType}; snapshot=${p.page.snapshotId}, ${p.page.snapshotSource}, ${p.page.snapshotAt}; ACTIVE findings=${ledger.pages.B.activeFindings}. Search period ${p.search.period.from}–${p.search.period.to}; unique queries=${p.search.totalQueries}, selected=${p.search.queries.length}.`,
 '', `Title: ${String(p.content.title.value)} (${p.content.title.id}, ${p.content.title.state}/${p.content.title.coverage}). H1 ${p.content.h1.id}: UNKNOWN; Description ${p.content.description.id}: UNKNOWN. Наличие null не доказывает отсутствие на production.`,
 '', 'Полный Search summary:', '', '```json',JSON.stringify(p.search.summary.value,null,2),'```','',
 '| ID | Исходный запрос | Показы | Клики | CTR % | Avg position | Existing intents |',
 '| --- | --- | ---: | ---: | ---: | ---: | --- |');
 for(const e of p.search.queries){const q=e.value as Record<string,unknown>;lines.push(`| ${e.id} | ${String(q.query).replace(/\|/g,'\\|')} | ${q.impressions} | ${q.clicks} | ${q.ctr??'UNKNOWN'} | ${q.avgPosition??'UNKNOWN'} | ${Array.isArray(q.intents)?q.intents.join(', '):'UNKNOWN'} |`);}
 lines.push('', 'Это фактические 25 bounded Search records из неизменного профиля, переданного модели, а не evidence IDs принятых рекомендаций. Все относятся к указанным странице/периоду. demand не передавался. Полные provenance/state/coverage и period для каждого ID: test-results/sprint5-1-live-B-evidence.json.',
 '', '## Latency и фактические tokens','',
 '| Case | Builder ms | DeepSeek transport ms | Validator ms | End-to-end ms | Input tokens | Output tokens |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
 `| B | ${r.builderMs.toFixed(2)} | ${r.transportMs.toFixed(2)} | ${r.review.metadata.validatorMs.toFixed(2)} | ${r.totalMs.toFixed(2)} | ${r.usage.inputTokens} | ${r.usage.outputTokens} |`,
 '', `Всего **${r.usage.inputTokens+r.usage.outputTokens} tokens**. Счётчики взяты из usage реального transport, не оценены по длине текста. End-to-end включает подготовку/валидацию и acceptance overhead. A/E latency/tokens N/A — вызовов не было.`,
 '', '## Page360 performance','',
 `Тот же contacts Page360 M3, один warm-up исключён, затем по пять последовательных GET. До mean ${before.mean.toFixed(2)} ms / median ${before.median.toFixed(2)} ms; после mean ${after.mean.toFixed(2)} ms / median ${after.median.toFixed(2)} ms; изменение mean ${((after.mean/before.mean-1)*100).toFixed(2)}%. Все 10 измеренных ответов 200. Это отдельный initial GET без запуска AI builder/provider; timings DeepSeek в него не входят. Локальная серия не доказывает универсальную latency при иной нагрузке.`,
 '', 'Samples before: '+before.samples.map((s:{ms:number})=>s.ms.toFixed(2)).join(', ')+' ms. Samples after: '+after.samples.map((s:{ms:number})=>s.ms.toFixed(2)).join(', ')+' ms.',
 '', '## Integrity / проверки','',
 `Final integrity: ${ledger.finalIntegrity?.codeUnchanged&&ledger.finalIntegrity?.dataUnchanged?'PASS':'NOT CONFIRMED'}. Whole-row hashes совпали для Scan, ScanPage, JobRun, MetrikaPageDaily, WebmasterQueryDaily, BusinessRecord, Import, Opportunity, Page, SeoAction. Prompt/provider/guards/config/ENV/old ledgers не изменены. Production crawl/sync/export, новые Pages/SeoActions, публикация и другие запрещённые направления не запускались.`,
 '', 'Application code не дорабатывался в live-приёмке. Новый harness прошёл typecheck; исходные 337/337 offline tests/build/schema/security результаты остаются прежней отдельной технической проверкой, не новым product PASS. После серии выполнен secrets check.',
 '', '## Следующий шаг','',
 '**READY WITH FIXES / LIVE FAIL.** Нужна отдельная offline-задача на диагностику оставшихся FACT_VALUE/absence/number/CTR отказов и проверку полезности. Не ослаблять guards ради acceptance; не менять текущую серию и не генерировать повтор до удачи. Дальнейший live — только после отдельно согласованных изменений и нового разрешения/ledger.');
 writeFileSync('SPRINT5_1_LIVE_REVALIDATION.md',lines.join('\n')+'\n');
 console.log('PASS report: complete accepted set is empty; rejection codes only; original bounded Search; latency/usage; Page360; integrity. No API call.');
}finally{await db.$disconnect();}
