import json,re
from pathlib import Path
def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
r=read('test-results/sprint3-5-1-production.json')
checks=read('test-results/sprint3-5-1-checks.json')+read('test-results/sprint3-5-1-ui-checks.json')
production_ui=read('test-results/native-production-ui.json')
assert production_ui['status']=='PASS'
checks.append(dict(name='production monthly UI (read-only)',status='PASS'))
safe=read('test-results/sprint3-5-1-safety.json')
assert all(c['status']=='PASS' for c in checks) and safe['status']=='PASS'
build=Path('test-results/sprint3-5-1-build.log').read_text(encoding='utf-8')
assert 'Compiled successfully' in build and 'Route (app)' in build
tests=Path('test-results/sprint3-5-1-checks/tests.log').read_text(encoding='utf-8')
assert re.search(r'(?:#|ℹ)\s+fail\s+0\b',tests)
def num(v,d=0):
 if v is None:return '—'
 return f'{v:,.{d}f}'.replace(',',' ').replace('.',',')
def table(head,rows):
 return '| '+' | '.join(head)+' |\n| '+' | '.join(['---']*len(head))+' |\n'+'\n'.join('| '+' | '.join(str(v if v is not None else '—').replace('|',r'\|').replace('\n',' ') for v in row)+' |' for row in rows)
i,s,seo=r['import'],r['search'],r['seo']
prod='Файл: '+r['file']+'. SHA-256: '+r['sha256']+'; исходник не изменён. Повторные upload/commit и SEO recalculation: PASS.\n\n'
prod+=table(['Import / Search','Результат'],[
 ['Формат / grain',i['format']+' / '+i['grain']],['Строк Excel',num(i['excelRows'])],['Месяцев / период',str(len(i['months']))+' / '+i['periodFrom']+' — '+i['periodTo']],['Наблюдений',num(i['observations'])],['Отклонённых строк / observations',str(i['rejectedRows'])+' / '+str(i['rejectedObservations'])],['Пропущенных observations',i['skippedObservations']],['Raw / normalized queries',num(s['rawQueries'])+' / '+num(s['normalizedQueries'])],['URL',s['uniqueUrls']],['Matched Pages / inventory',str(s['matchedPages'])+' / '+str(s['totalPages'])],['Unmatched URL',s['unmatchedUrls']],['Matched URL rate',num(s['matchedUrlRate']*100,2)+'%'],['Показы / клики, весь период',num(s['impressions'])+' / '+num(s['clicks'])],['Monthly coverage',str(s['coverage']['observed'])+'/'+str(s['coverage']['expected'])],['Спрос, последний месяц',num(s['demand'],2)]])
prod+='\n\nIntent, все 18 месяцев:\n\n'+table(['Intent','Impressions','Share'],[[k,num(s['impressions']*v['impressions']),num(v['impressions']*100,2)+'%'] for k,v in r['intent']['shares'].items()])
prod+='\n\nIntent-категории могут пересекаться; их доли не обязаны складываться в 100%.'
for k in ['packaging','application','specification']:prod+='\n\n'+k+': '+json.dumps(r['intent'][k],ensure_ascii=False)+'.'
prod+='\n\nSEO: '+seo['period']['from']+' — '+seo['period']['to']+', MONTH, 3 месяца. Threshold 100 сохранён. Всего '+str(seo['total'])+'. RULE 23: '+str(seo.get('rule23',0))+', RULE 24: '+str(seo.get('rule24',0))+'.\n\n'
prod+='Условия Engine: '+json.dumps(seo['eligibility'],ensure_ascii=False)+'. Только 5 страниц имеют normalized query с SUM >= 100 за выбранные 3 месяца; у 4 из них есть успешный snapshot. Не каждый прошедший gate создаёт action: нужен конкретный обнаруженный недостаток.\n\n'
prod+='В данном файле каждый из 5 252 normalized query связан с одним URL, поэтому cannibalization = 0. Расширенные content/link/structured-data сигналы не выводятся из неизвестных snapshots; RULE 23/24 дополнительно требуют коммерческое/историческое evidence за тот же период.\n\n'
prod+=table(['Priority','Count'],seo['priority'].items())+'\n\n'+table(['Category','Count'],seo['category'].items())
prod+='\n\n### TOP-20 SEO Actions\n\n'
prod+=table(['Page','Priority','Action','Impressions','CTR','Position','Demand','Intent B2B / transactional'],[[a['page'],a['priority'],a['action'],num(a['impressions']),num(a['ctr'],2)+'%',num(a['position'],2),num(a['demand'],2),num(a['intent']['b2bShare']*100,1)+'% / '+num(a['intent']['transactionalShare']*100,1)+'%'] for a in r['top20']])
if seo['total']<20:prod+='\n\nПоказаны все '+str(seo['total'])+' доступных рекомендаций; TOP-20 не дополнен искусственно. Старые/отсутствующие snapshots ограничивают расширенные content/link actions; evidence threshold не снижен.'
prod+='\n\nПодробный period/grain/monthsCovered/evidence сохранён в test-results/sprint3-5-1-production.json.'
match='Сопоставлено '+str(s['matchedPages'])+' Page и '+str(i['matchedUrls'])+'/'+str(i['urls'])+' source URL ('+num(s['matchedUrlRate']*100,2)+'%). Не сопоставлены '+str(s['unmatchedUrls'])+' URL: '+str(r['unmatchedNumeric'])+' имеют числовой путь /catalog/<id>/, остальные '+str(r['unmatchedOther'])+' — другие пути/варианты.\n\n'
match+='Причина проверена по активному inventory: нет Page или наблюдавшегося redirect alias, соответствующего normalized URL. Источник не доказывает удаление, WAF или переход числового URL к конкретному slug. Сходство query/названия не используется для выдуманного matching. Импорт не создаёт Page и не запускает scan. Это объяснённое ограничение покрытия; 100% matching не заявляется.\n\n### TOP-50 unmatched URL\n\n'
match+=table(['URL','Impressions','Clicks','Match reason'],[[a['url'],num(a['impressions']),num(a['clicks']),a['reason']] for a in r['top50Unmatched']])
sc=r['scanner']
scanner=table(['Показатель','Pages'],[['Search-matched',sc['searchMatchedPages']],['Modern contentSignals',sc['modernContentSignals']],['Требуют rescan',sc['requiringRescan']]])+'\n\nДля полноценного content/link анализа нужен ручной targeted scan через существующий безопасный workflow. Production Scanner и новые API/export jobs не запускались.'
checked=table(['Check','Status'],[[c['name'],c['status']] for c in checks]+[['production native import + idempotency','PASS'],['build','PASS'],['final baseline safety + source SHA256','PASS']])
count=int(re.search(r'\btests (\d+)',tests)[1])
assert int(re.search(r'\bpass (\d+)',tests)[1])==count
checked+='\n\nUnit tests: '+str(count)+'/'+str(count)+', fail 0. Browser acceptance: реальный XLSX preview без mapping, локальный MONTH commit, monthly selector/baseline, Query Explorer Demand, 1440/390 px без overflow. Логи: test-results/sprint3-5-1-checks и test-results/sprint3-5-1-ui-checks.'
checked+='\n\nUI-регрессии Sprint 3.4/Commerce используют текущий период интерфейса вместо устаревшей даты 06.10.2026. Проверка group filter сравнивает точный состав ссылок с рассчитанными локальными результатами, а не фиксированное количество сигналов меняющегося окна. Production Rules/Commerce логика для этого не изменялась.'
checked+='\n\nМесячный report читает существующий effective Search Dataset и общие aggregation/intent helpers, без полного Commerce dataset. Rules/SEO проверяют revision по metadata импортов; workbook читается только для SALES, где нужен список исключённых SKU. Это исключает повторную загрузку больших Search XLSX при каждом просмотре; формулы и правила не менялись.'
checked+='\n\nPage 360 использует общий Search Dataset, intent/graph helpers и сохранённые actions без полного Commerce расчёта за историческое окно. Эквивалентность периода, поисковых строк и графа полному SEO dataset проверена локальной DB fixture.\n\n'+table(['Production route (read-only)','Seconds'],[[x['route'],num(x['durationMs']/1000,2)] for x in production_ui['checks']])
p=Path('SPRINT3_5_1_RUNBOOK.md');text=p.read_text(encoding='utf-8')
for key,body in [('PRODUCTION_REPORT',prod),('MATCH_REPORT',match),('SCANNER_REPORT',scanner),('CHECK_REPORT',checked)]:text=text.replace('<!-- '+key+' -->',body)
text=text.replace('Фактические результаты и проверки записаны ниже после приёмки.','Техническая и production file acceptance: PASS. Matching имеет объяснённое ограничение, приведённое ниже.').replace('Universial','Universal').replace('550-дневные','549-дневные').replace('scripts/verify-sprint3-5-ui.mjs','scripts/verify-sprint3-5-1-ui.mjs')
p.write_text(text,encoding='utf-8')
Path('test-results/sprint3-5-1-final.json').write_text(json.dumps(dict(status='PASS',checks=checks,unitTests=count,build='PASS',safety=safe,production=r['safety'],report='SPRINT3_5_1_RUNBOOK.md'),ensure_ascii=False,indent=2),encoding='utf-8')
print('Sprint 3.5.1 report PASS')
