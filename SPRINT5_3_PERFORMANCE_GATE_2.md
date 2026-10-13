# Sprint 5.3 — Performance Gate 2

09.10.2026. **Итог: UNRESOLVED. Доказательств для снятия performance-блокировки с live SEO Review недостаточно. DeepSeek calls: 0.** Бизнес-код, настройки PostgreSQL, данные, schema и migrations не менялись. Исправления не внедрялись.

## Историческая сборка и причинный контроль

Рабочая папка не является Git repository; пользователь подтвердил отсутствие Git. Приложенных worktree нет, каталога `.codex/worktrees` нет, Docker images содержат PostgreSQL/Neo4j, но не приложение. В проекте, соседних каталогах/архивах и именованных кандидатах Downloads/Desktop/Documents полноценная старая сборка Growth Radar не найдена. `.codex/backup-deepseek` содержит конфигурацию, не проект. Единственный доступный runtime — текущий `.next/standalone`; его BUILD_ID совпадает с `.next/BUILD_ID`: `NgBDb7_6BQXH5Ofe9xE7Z`.

Сохранённые fingerprints, test logs, profiles и Next cache не являются воспроизводимой исторической сборкой. Они не использовались как A. Историческое состояние не реконструировалось, отдельный worktree не создавался. **A/B до/после Sprint 5.3 не выполнен. Ни наличие, ни отсутствие регрессии Sprint 5.3 не доказано.** Поиск ограничен указанными доступными местами; это не утверждение об отсутствии резервной копии на любом носителе.

## Текущая сборка: все серии

Тот же contacts URL `/pages/cmuv6ydso000t20gomgcaf3mg?searchPeriod=M3`, одна БД, один production Next.js PID **43312**, concurrency 1. Штатный сервер/worker предварительно остановлены; два сервера Growth Radar одновременно не работали. Во время замеров worker OFF, активных scans/sync jobs нет. Между запросами 300 ms; без build/tests и внешних запросов. Диагностический preload измеряет Prisma и engine query events, CPU-профайлер выключен; это измерение с накладными расходами, а не новая чистая baseline.

| Серия | Все total ms, без исключений | Median total | Median server | Prisma interval union | Остаток server | Engine SQL durations, сумма | Process CPU ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1627.63, 1296.58, 1153.47, 1057.45 | 1225.03 | 1209.90 | 853.52 | 356.38 | 440 | 1547.0 |
| 2 | 1141.87, 1100.57, 1057.22, 1023.31 | 1078.89 | 1067.19 | 789.66 | 274.03 | 458 | 1210.5 |
| 3 | 963.15, 889.54, 1069.70, 998.30 | 980.72 | 968.24 | 736.60 | 237.86 | 438 | 1180.5 |
| 4 | 1018.56, 995.44, 948.32, 852.24 | 971.88 | 960.81 | 736.09 | 229.19 | 376 | 1093.5 |

Медиана всех 16 warm total: **1040.27 ms**. Cold server GET **11401.62 ms**, три warm-up **1226.98 / 1005.52 / 1067.55 ms** сохранены отдельно и не включены. Отдельный GET для EXPLAIN capture также не включён. Исторические 551.30 ms не являются A-контролем; нельзя сравнивать их с этими инструментированными сериями как доказательство кодовой регрессии. Чистые серии Gate 1 уже подтвердили наблюдаемое замедление без preload.

Все time columns — независимые медианы. Prisma union считает пересечения один раз; суммы engine durations могут перекрываться и не являются wall-time. Остаток включает подготовку, React/RSC, сериализацию и scheduling; чистое React-время не выделено.

## Breakdown Prisma

**26 model-операций + 1 raw SELECT = 27 операций** на каждом warm GET. Прежний `$allModels` счётчик пропускал raw SQL `availableMonths`. Engine выполняет **32–35 statements**, поскольку include relations и batching не соответствуют одной SQL-команде на одну Prisma-операцию. В JSON есть интервалы каждой операции каждого GET, engine duration каждого statement и безопасные signatures.

Ниже полное покрытие 27 операций, сгруппированных по точному совпадению model/operation/args внутри одного процесса. Аргументы заменены HMAC с неперсистентным случайным ключом. × — число вызовов на GET; duration — медиана одного вызова, диапазон по всем 16 warm GET. Группы с разными projections/filters не объединены.

| ID | Операция | × | Median ms | Min–max ms |
| --- | --- | ---: | ---: | ---: |
| G1 | Page.findUnique | 1 | 44.26 | 28.08–68.16 |
| G2 | Page.findUniqueOrThrow | 3 | 21.16 | 12.77–51.86 |
| G3 | Opportunity.findMany | 1 | 58.26 | 50.33–77.17 |
| G4 | BusinessRecord.findMany | 1 | 31.01 | 16.84–47.12 |
| G5 | Integration.findUnique | 2 | 16.56 | 9.79–31.67 |
| G6 | Integration.findUnique | 1 | 20.08 | 12.12–31.51 |
| G7 | BusinessRecord.findMany | 1 | 19.40 | 14.09–27.06 |
| G8 | MetrikaPageDaily.findMany | 1 | 23.47 | 14.14–28.16 |
| G9 | Page.findUniqueOrThrow | 1 | 26.01 | 18.87–55.54 |
| G10 | Integration.findUnique | 1 | 19.28 | 13.06–51.74 |
| G11 | Page.findUniqueOrThrow | 1 | 22.97 | 14.80–53.78 |
| G12 | Site.findUnique | 1 | 13.15 | 10.80–18.40 |
| G13 | WebmasterQueryDaily.findFirst | 1 | 14.65 | 9.76–19.64 |
| G14 | RAW.$queryRaw / availableMonths | 1 | 84.34 | 47.24–228.22 |
| G15 | Integration.findUnique | 2 | 29.78 | 17.62–331.93 |
| G16 | WebmasterQueryDaily.findMany | 1 | 18.85 | 14.41–29.34 |
| G17 | MetrikaPageDaily.findMany | 1 | 30.25 | 22.18–42.00 |
| G18 | WebmasterQueryDaily.findMany | 1 | 18.06 | 14.87–138.48 |
| G19 | WebmasterQueryDaily.findMany | 1 | 79.04 | 15.91–267.72 |
| G20 | Integration.findUnique | 1 | 76.53 | 10.37–266.85 |
| G21 | ScanPage.findFirst | 1 | 78.71 | 12.72–265.72 |
| G22 | WebmasterQueryDaily.findMany | 1 | 106.25 | 78.80–210.51 |
| G23 | SeoAction.findMany | 1 | 17.13 | 14.56–92.90 |

Потенциальные дубли: **G2 ×3** — одинаковый Page + Site в Commerce, Analytics и SEO; **G5 ×2**, **G15 ×2** — одинаковые Integration reads. Это четыре повторных вызова сверх уникальных сигнатур, не четыре гарантированно лишних SQL statements: Prisma уже batch-объединяет часть одновременных reads. Семь Integration вызовов имеют пять разных сигнатур. Четыре Webmaster findMany отличаются периодами/projections; считать их дубликатами только по имени модели неправильно.

По моделям median суммы клиентских elapsed: Integration **407.45 ms** (7 calls), WebmasterQueryDaily **318.05 ms** (5), Page **170.90 ms** (6), raw **84.34 ms** (1), ScanPage **78.71 ms** (1), остальные ниже. **Эти суммы перекрываются; Integration нельзя объявлять основной SQL-проблемой по этой таблице.**

## Последовательные зависимости

Зависимости подтверждены исходниками, а не только порядком timestamps:

1. Parent: Page с latest/history → параллельно Commerce и Opportunities → ожидание Commerce → запуск дочерних async-компонентов. Commerce: Page/Site → mapping seeds → параллельные records/configs → Metrika → JS preparation. Для contacts дополнительные product mapping branches не исполняются.
2. HistoricalUrls читает свой Page projection и возвращает null при отсутствии aliases; в данном trace его Search/traffic ветка не исполняется. Analytics: currentSite → Page/Site → последовательные Integration reads → параллельно Metrika и Search; внутри Search сначала candidate URLs, затем rows.
3. SEO: Page → monthly availability findFirst → seoPageView Page/Site → **availableMonths raw SELECT** → Webmaster config → параллельно candidate URLs, SEO config и snapshot → Search rows → intent/render preparation → SeoAction. `searchDataset` имеет обязательную последовательность candidate URLs → full rows. Детальный graph выключен.

Трасса первого warm запроса сохранена целиком, не выбрана как самая быстрая. Во всех 16 traces есть интервалы параллельности; временная близость без source dependency не трактуется как причинная связь.

## Prisma vs фактическое SQL execution

Настройки PostgreSQL не менялись. `pg_stat_statements`/auto_explain отсутствуют, shared_preload_libraries пуст; statement duration logging выключен. Поэтому фактическое серверное SQL-время **исходных HTTP GET** недоступно. Engine query event duration тоже не равен чистому PostgreSQL execution time.

После HTTP-серий сохранённые только в памяти **25 различных SELECT** повторены по два раза через `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` в транзакции **READ ONLY**: всего **50 успешных выполнений**. Read-only mode действует только в этой диагностической транзакции, серверная конфигурация не менялась. SQL, параметры, Filters/Conditions и строки результатов не сохранены; записаны только execution/planning/client times, типы узлов, relation names, counts и buffer counters.

- `availableMonths`: фактический execution **58.19 / 72.41 ms**. Unique над Index Only Scan просматривает **94 536** записей, возвращает 18 months; **36 154 shared hits**, 0 reads. Это самый дорогой SELECT в данной выборке и последовательный участок SEO-пути.
- Search full rows: **20.50 / 15.66 ms**, Bitmap Index/Heap Scan + Sort, 165 строк результата, 7087 shared hits. Candidate URLs: **4.88 / 4.57 ms**, Index Scan, 165 строк; distinct обработки ORM и последующая JS-подготовка в EXPLAIN не входят.
- Mapping seed: **4.80 / 3.04 ms**, прочие SELECT преимущественно менее 1 ms; один Metrika повтор 2.66 ms.
- Integration SELECT: каждый повтор **0.069–0.887 ms**, несмотря на отдельные клиентские ожидания до **331.93 ms**. Следовательно, такие задержки нельзя приписывать исполнению Integration SQL: в клиентском интервале присутствуют другие ожидания/декодирование/scheduling, которые здесь не разделены.

Сумма execution по 25 уникальным replay SELECT: **93.18 / 103.14 ms**; это **не SQL total одного GET**: исключены повторные statements, возможны отличия batch shape, другие planning/cache/load условия. EXPLAIN не передаёт исходные rows клиенту, не измеряет их обычную output serialization/передачу, в частности JSON/TOAST, и ORM materialization. Вычитать эту сумму из HTTP wall и называть разницу «чистым Prisma overhead» нельзя. Наблюдение локализует SQL-cost, но не объясняет весь разрыв до секунды.

## CPU, память и состояние PostgreSQL

Host CPU в граничных снимках **33–59%**, свободная RAM **1.78–2.36 GiB**. Background процессы активно потребляли CPU; их counters сохранены без command lines. Counter snapshots собирались не одновременно, поэтому точные проценты отдельных процессов из них не выводятся. Page360 process CPU на запрос median **1264.5 ms**, RSS на границах серий **183–235 MiB**, 16 logical CPUs. CPU включает JS и встроенный многопоточный Prisma engine; значение может превышать wall-time. Это подтверждает заметную вычислительную работу, но не выделяет стоимость конкретного модуля.

Медианы снижались вместе с изменением нагрузки/прогревом. Изоляции CPU, paging counters и контролируемого idle/load A/B нет; нельзя объявлять фоновый процесс причиной или считать рост RSS утечкой. В warm HTTP сериях PostgreSQL: 0 disk reads, temp files, deadlocks, rollbacks; snapshots без Lock wait. Это не исключает кратких ожиданий между снимками. В replay планы также без disk/temp reads.

## Контроль и вывод

Whole-row hashes/counts **12 таблиц** и fingerprints **980 файлов** (src, Prisma, root/served server bundles, BUILD_ID, entrypoint, manifests/ledgers, ENV/package files) совпали до/после. Настройки/данные не записывались; findings не пересчитывались. Final GET не вызывает AI action: ранее runtime coverage Gate 1 показал count 0; здесь весь диагностический процесс блокирует внешние fetch, **external attempts 0**. Prompt/provider/model/guards не менялись.

Штатный server + Scanner supervisor восстановлены без preload. Typecheck и syntax checks выполнены; rebuild/migrations/full business regression не запускались, поскольку бизнес-код не менялся и требовалась неизменная сборка. Две ошибки подготовки harness до первого HTTP measurement сохранены в preflight: EISDIR при inventory, затем остановлен чрезмерно широкий dependency fingerprint. Они не заменяют и не исключают измеренные запросы.

**UNRESOLVED**: текущие дорогие SQL и повторные reads установлены, но стоимость client/runtime/render не полностью разделена, старой сборки для причинного контроля нет. Подтверждённой регрессии Sprint 5.3 и минимального исправления для неё не найдено; никакие оптимизации не внедрены. Даже устранение потенциальных duplicate reads или стоимости availableMonths потребовало бы отдельного согласования и контрольного измерения, а не признания их причиной Sprint 5.3 regression.

**Performance-блокировку с live SEO Review не снимать:** отсутствие доказанной регрессии не доказывает её отсутствие. Для следующего решения нужны полноценный исторический artifact либо отдельно согласованный критерий текущей производительности и более узкое исследование client/runtime CPU. Live AI, crawl/sync/export и новые спринты не запускались.

Доказательства: `test-results/sprint5-3-performance-gate2-{preflight,before,after,pg-config,summary,host-analysis,final-check}.json`, `*-{client,requests,series}.jsonl`. В summary есть все 23 группы, каждый из 27 интервалов первого warm GET, per-model/per-SQL-group breakdown и безопасные 50 EXPLAIN результатов. Тексты SQL, параметры и строки результатов не сохранялись. Финальный контроль после восстановления штатного сервера: 12 таблиц / 980 fingerprints совпали, secrets check PASS, active scans 0, external attempts 0.
