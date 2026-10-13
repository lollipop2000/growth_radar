# SEO Tuning Round 1 + Performance Investigation — 08.10.2026

## Status

Выполнены audit, read-only simulations, узкая доказанная коррекция 470 Page types и три низкорисковые performance corrections. Query gate **KEEP CURRENT**: расширение не прошло quality review. Production scan/export/sync не запускались, Sprint 4/AI не начаты. M3 recalc выполнен обычным engine; historical Commerce проверен только в памяти. Основные исходные таблицы и сохранённые Opportunities неизменны по полным count/checksum; изменены Page.pageType/updatedAt и штатные производные SEO Actions/integration lastRun.

Build, typecheck, 150 tests, Scanner и redirect/alias fixtures, migrations (11 applied), schema drift, secrets: см. итоговые logs в test-results/seo-tuning-*. Первая build попытка EPERM из-за параллельного Prisma profiler; после завершения reader сборка повторена. Это ошибка sequencing инструментов, не приложения.

## SEO funnel

ALL Search universe: 1163 raw URL, matched 998 (85.81%), unique Page 710. M3 01.06–31.08.2026 содержит Search observations у 695 из этих Page; оставшиеся 15 имеют Search только вне M3. Эти cohorts нельзя смешивать.

| Stage | Count | Причина отсева |
| --- | --- | --- |
| Matched ALL Pages | 710 | исходная Search связь |
| M3 Search-matched Pages | 695 | 15 не имеют M3 observations |
| modern content | 653 | 57 ALL Page без modern; 42 из M3 cohort |
| ELIGIBLE modern | 653 | все 653 имеют сохранённые положительные indexability signals |
| ≥1 M3 query | 653 | Search evidence присутствует |
| coverage ≥75% | 653 | 3/3 месяцев; coverage не доказывает полноту всех queries |
| enough individual query ≥100 | 4 | 649 Page не имеют одного normalized query с 100 M3 impressions |
| SEO rule input eligible | 4 | содержание и Search присутствуют |
| Pages generating actions | 4 | 6 actions; достаточный gate не обещает action для каждой rule |


## Page type audit

product означает карточку одной товарной сущности/группы, возможно нескольких SKU. category означает общую товарную выдачу/подборку; filter сохраняет category с отдельным URL kind. Количество SKU само по себе не делает страницу category. Старый classify() проверял prefix /catalog/ и возвращал category; saveScanPage перезаписывал automatic type после каждого scan. Это доказанный classifier bug в применении к сохранённому detail template, а не сознательная модель «все страницы каталога — категории». Источник исторических product assignments нельзя восстановить из модели без type-history; нельзя объявлять их подтверждёнными карточками без snapshots.

Коррекция требует одновременно: URL без query/filter, одна активная группа в подтверждённом mapping через primary/observed aliases; совпадение всех mapped productName с H1; H1 + mapped SKU в topText; detail panels «Описание», «Документы/Характеристики»; price и availability signals. Numeric leading-zero display padding используется только как content evidence; SKU/registry не меняются. Manual types сохранены. Несколько групп, отсутствующее/противоречивое evidence не изменены. Сначала сформированы samples/preview, затем применён guarded update; тот же classifier включён в existing storage adapter, чтобы будущие scans не вернули доказанные карточки в category. Ошибка scan и legacy import без modern evidence не стирают известный product type; отдельный storage lifecycle fixture PASS.

| ALL matched Page type | Before | After |
| --- | --- | --- |
| product | 46 | 516 |
| category | 660 | 190 |
| homepage | 1 | 1 |
| informational | 3 | 3 |

Modern product 0→470; modern category 649→179 (в том числе две matched facets). SKU-linked matched category 642→172. В M3 modern mapped cohort 633: 612 одной группы и 21 нескольких групп; 470 получили коррекцию, 163 оставлены. Более широкая формула «одна группа = product» не внедрена.

Breadcrumb hierarchy/DOM template не сохранены отдельно: в topText виден «Каталог продукции», но это не доказательство полной breadcrumb цепочки. Schema не использовалась как отсутствующее обязательное свидетельство: Product/Offer=0. URL slug является boundary, не единственным classifier evidence.

### 20 high-impression SKU-linked category — baseline sample

| URL | Current type | SKU | Groups | M3 impressions | Content evidence | Proposed / applied | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | category | 2 | 288 | 372 | H1: G-Special UTTO 10W-30 Канистра 20 л; G-Special UTTO 10W-30 Канистра 20 л Каталог продукции 000253390034, 000253390082 В наличии 1 000 л 20 л 205 л 11 423.35 ₽ 100% гарантия от п; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-20-l/ | category | 3 | 1065 | 256 | H1: Gazpromneft Diesel Premium 10W-40 Канистра 20 л; Gazpromneft Diesel Premium 10W-40 Канистра 20 л Каталог продукции 000253140365, 000253141969, 002389900042, 002389901213, 002389907851 В нал; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-20-l/ | category | 3 | 2344 | 224 | H1: G-Profi MSI 10W-40 Канистра 20 л; G-Profi MSI 10W-40 Канистра 20 л Каталог продукции 000253140349, 002389900050, 002389907380, 002531401364 В наличии 5 л 10 л 20 л 50 л 205 л; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hlp-46-kanistra-20-l/ | category | 5 | 309, 4713 | 219 | H1: Gazpromneft Hydraulic HLP-46 Канистра 20 л; Gazpromneft Hydraulic HLP-46 Канистра 20 л Каталог продукции 000253420044, 000253420078, 000253420260, 000253420354, 000253420380, 000253420; schema none | category | неоднозначность групп; без изменения |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | category | 1 | 486 | 211 | H1: G-Energy Synthetic Active 5W-40 Канистра 4 л; G-Energy Synthetic Active 5W-40 Канистра 4 л Каталог продукции 000253142410 В наличии 1 л 4 л 5 л 20 л 50 л 205 л 2 416.83 ₽ 100% гарантия о; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | category | 3 | 2419 | 197 | H1: Gazpromneft Premium N 5W-40 Канистра 4 л; Gazpromneft Premium N 5W-40 Канистра 4 л Каталог продукции 000253140423, 002389900144, 002389907666 В наличии 1 л 4 л 5 л 50 л 205 л 2 210.0; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hvlp-32-bochka-205-l/ | category | 8 | 219, 4694 | 166 | H1: Gazpromneft Hydraulic HVLP-32 Бочка 205 л; Gazpromneft Hydraulic HVLP-32 Бочка 205 л Каталог продукции 000253420224, 000253420362, 000253420364, 000253421952, 002389900263, 0023899002; schema none | category | неоднозначность групп; без изменения |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hlp-46-bochka-205-l/ | category | 11 | 4715, 310 | 144 | H1: Gazpromneft Hydraulic HLP-46 Бочка 205 л; Gazpromneft Hydraulic HLP-46 Бочка 205 л Каталог продукции 000253420140, 000253420248, 000253420261, 000253420353, 000253420379, 00025342038; schema none | category | неоднозначность групп; без изменения |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-20-l/ | category | 3 | 2410 | 139 | H1: Gazpromneft Premium L 10W-40 Канистра 20 л; Gazpromneft Premium L 10W-40 Канистра 20 л Каталог продукции 000253140402, 002389907288, 002389907635, 002531401369 В наличии 1 л 4 л 5 л 20; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/g-special-to-4-10w-kanistra-20-l/ | category | 4 | 292 | 132 | H1: G-Special TO-4 10W Канистра 20 л; G-Special TO-4 10W Канистра 20 л Каталог продукции 000253390014, 000253390035, 000253390069, 000253390093, 002389900526 Нет в наличии 1 000 ; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/g-box-awd-hldx-kanistra-1-l/ | category | 1 | 5757 | 130 | H1: G-Box AWD HLDX Канистра 1 л; G-Box AWD HLDX Канистра 1 л Каталог продукции 000253650187 В наличии 1 л 205 л 2 903.87 ₽ 100% гарантия от подделок. товар от производителя ; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-bochka-205-l/ | category | 2 | 2420 | 126 | H1: Gazpromneft Premium N 5W-40 Бочка 205 л; Gazpromneft Premium N 5W-40 Бочка 205 л Каталог продукции 000253140426, 002389900145, 002389907665 В наличии 1 л 4 л 5 л 50 л 205 л 84 158.2; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-4-l/ | category | 1 | 1063 | 108 | H1: Gazpromneft Diesel Premium 10W-40 Канистра 4 л; Gazpromneft Diesel Premium 10W-40 Канистра 4 л Каталог продукции 000253142104, 002389901339 В наличии 1 000 л 4 л 5 л 10 л 20 л 30 л 50 л 20; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-5-l/ | category | 3 | 2409 | 103 | H1: Gazpromneft Premium L 10W-40 Канистра 5 л; Gazpromneft Premium L 10W-40 Канистра 5 л Каталог продукции 000253140406, 000253142212, 002389907294, 002389907641, 002531401366 В наличии 1; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/i-30a-bochka-205-l/ | category | 1 | 3164 | 94 | H1: И-30А Бочка 205 л; И-30А Бочка 205 л Каталог продукции 002389901103 Нет в наличии 205 л 43 060.89 ₽ 100% гарантия от подделок. товар от производителя Описание ; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-gk-marka-1-bochka-205-l/ | category | 1 | 367 | 93 | H1: Gazpromneft ГК марка 1 Бочка 205 л; Gazpromneft ГК марка 1 Бочка 205 л Каталог продукции 000253511618, 002389907859 Нет в наличии 205 л 46 411.20 ₽ 100% гарантия от подделок. т; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/m-8v-kanistra-20-l/ | category | 1 | 1281 | 93 | H1: М-8В Канистра 20 л; М-8В Канистра 20 л Каталог продукции 002389900064 В наличии 1 л 1 000 л 4 л 5 л 20 л 50 л 205 л 5 176.96 ₽ 100% гарантия от подделок. товар ; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-cutfluid-universal-kanistra-20-l/ | category | 1 | 759 | 92 | H1: Gazpromneft Cutfluid Universal Канистра 20 л; Gazpromneft Cutfluid Universal Канистра 20 л Каталог продукции 000258310030 В наличии 1 000 л 20 л 205 л 22 833.83 ₽ 100% гарантия от поддел; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-racing-5w-40-kanistra-4-l/ | category | 1 | 5547 | 90 | H1: G-Energy Racing 5W-40 Канистра 4 л; G-Energy Racing 5W-40 Канистра 4 л Каталог продукции 000253140622 В наличии 4 л 4 068.33 ₽ 100% гарантия от подделок. товар от производителя; schema none | product | одна группа, точный H1, SKU и product template |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-gt-10w-40-bochka-205-l/ | category | 2 | 2345 | 84 | H1: G-Profi GT 10W-40 Бочка 205 л; G-Profi GT 10W-40 Бочка 205 л Каталог продукции 000253130116, 002389906923 В наличии 20 л 205 л 118 405.98 ₽ 100% гарантия от подделок. това; schema none | product | одна группа, точный H1, SKU и product template |

### 20 current product — baseline sample

ALL matched current products до correction: 46; modern product отсутствует. Приведены 20, сохранённого успешного content evidence у них нет. Это ограничения наблюдений, не доказательство удалённых товаров.

| URL | Current type | SKU | Groups | M3 impressions | Content evidence | Proposed / applied | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-adblue-kub-1-000-l/ | product | 1 | 570 | 9 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-white-oil-10-t-kub-1-000-l/ | product | 0 |  | 5 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-40-bochka-205-l/ | product | 1 | 5099 | 2 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-40-pro-g11-bochka-220-kg/ | product | 2 | 5215 | 2 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-pm-plus-220-kub-1-000-l/ | product | 1 | 701 | 1 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-super-10w-30-kanistra-5-l/ | product | 1 | 1021 | 1 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-0w-30-kanistra-1-l/ | product | 1 | 270 | 1 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-a5b5-5w-30-bochka-50-l/ | product | 1 | 5538 | 1 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-gl-5-75w-90-bochka-205-l/ | product | 1 | 547 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-gl-4-gl-5-75w-90-kanistra-4-l/ | product | 0 |  | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-gl-5-80w-90-bochka-205-l/ | product | 2 | 2825 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-gl-5-75w-90-kanistra-4-l/ | product | 1 | 546 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-c3-5w-40-bochka-205-l/ | product | 1 | 1752 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-a5b5-5w-30-kanistra-1-l/ | product | 1 | 4088 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-c2-c3-5w-30-kanistra-1-l/ | product | 1 | 406 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-c2-c3-5w-30-bochka-205-l/ | product | 1 | 409 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-gl-4-75w-90-kanistra-20-l/ | product | 1 | 2816 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-gl-5-75w-90-kanistra-20-l/ | product | 2 | 2821 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-grease-ep-2-bochka-170-kg/ | product | 1 | 996 | 0 | нет успешного content snapshot | product | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/i-12-bochka-205-l/ | product | 1 | 1344 | 0 | нет успешного content snapshot | product | недостаточно content evidence |

### Genuine category / filter sample

Доступно 9 boundary-compatible category/filter records в исследованном active universe, а не 20 подтверждённых категорий. Среди них четыре имеют modern list-template evidence; остальные — historical URL records без достаточного snapshot. Остальные no-SKU slug страницы из исходного sample фактически показывают product-like template, поэтому они намеренно не названы genuine categories. 20 достоверных разных category/filter snapshots в данных отсутствуют; они не создавались искусственно.

| URL | Current type | SKU | Groups | M3 impressions | Content evidence | Proposed / applied | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/ | category | 0 |  | 13058 | H1: none; Каталог продукции В наличии Акция Фильтры Сбросить Сортировка: Цена по убыванию Цена по возрастанию Цена по убыванию Масса по возрастанию Ма; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | category | 0 |  | 3917 | H1: none; Каталог продукции В наличии Акция Фильтры Сбросить Сортировка: Цена по убыванию Цена по возрастанию Цена по убыванию Масса по возрастанию Ма; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | category | 0 |  | 145 | H1: none; Каталог продукции В наличии Акция Фильтры Сбросить Сортировка: Цена по убыванию Цена по возрастанию Цена по убыванию Масса по возрастанию Ма; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/?new=y | category | 0 |  | 0 | нет успешного content snapshot | category | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/?display=list&new=y | category | 0 |  | 0 | нет успешного content snapshot | category | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/?FILTER_ITEM_IN_STOCK=Y&TECHNICS_TYPE%5B%5D=IND+-+%D0%B8%D0%BD%D0%B4%D1%83%D1%81%D1%82%D1%80%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5+%D0%BC%D0%B0%D1%81%D0%BB%D0%B0 | category | 0 |  | 0 | H1: none; Каталог продукции В наличии Акция Фильтры Сбросить Сортировка: Цена по убыванию Цена по возрастанию Цена по убыванию Масса по возрастанию Ма; schema none | category | не проходит весь консервативный набор evidence |
| https://shop.gazpromneft-sm.ru/catalog/?FILTER_ITEM_IN_STOCK=Y&PRODUCT_TYPE%5B%5D=%D0%B8%D0%BD%D0%B4%D1%83%D1%81%D1%82%D1%80%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5&TECHNICS_TYPE%5B%5D=IND+-+%D0%B8%D0%BD%D0%B4%D1%83%D1%81%D1%82%D1%80%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5+%D0%BC%D0%B0%D1%81%D0%BB%D0%B0 | category | 0 |  | 0 | нет успешного content snapshot | category | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog/?FILTER_ITEM_IN_STOCK=Y&PRODUCT_TYPE%5B%5D=%D1%81%D0%BC%D0%B0%D0%B7%D0%BA%D0%B0+%D0%BE%D0%B1%D1%89%D0%B5%D0%B3%D0%BE+%D0%BD%D0%B0%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D1%8F&TECHNICS_TYPE%5B%5D=IND+-+%D0%B8%D0%BD%D0%B4%D1%83%D1%81%D1%82%D1%80%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5+%D0%BC%D0%B0%D1%81%D0%BB%D0%B0 | category | 0 |  | 0 | нет успешного content snapshot | category | недостаточно content evidence |
| https://shop.gazpromneft-sm.ru/catalog?CATALOG_FILTER_P1_MAX=1041183.62&CATALOG_FILTER_P1_MIN=0.00&FILTER_ITEM_IN_STOCK=Y&PACKING%5B%5D=%D0%91%D0%BE%D1%87%D0%BA%D0%B0+205+%D0%BB&PAGEN_1=1&SAE%5B%5D=10W-40&SIZE=12&csrftoken=REDACTED&set_filter=Y | category | 0 |  | 0 | нет успешного content snapshot | category | недостаточно content evidence |


## Query evidence distribution

Threshold применяется к отдельному normalized query, агрегированному по Page за M3, включая разные raw URL aliases/region observations. Не к одному monthly row, не к total Page и не к intent. Затем querySummary строится только из проходящих query; Page coverage проверяется по всем её M3 observations. Existing normalization сохраняет пунктуацию: 5w40 и 5w-40 различны.

| 653 modern Pages | Count |
| --- | --- |
| ≥1 query | 653 |
| max query ≥100 | 4 |
| max 50–99 | 8 |
| max 20–49 | 39 |
| max <20 | 602 |
| SUM Page ≥100, individual <100 | 16 |


Long-tail подтверждён для 16 Page, но не для всех 649 excluded Page: только 20/653 имеют суммарные ≥100; основная причина — небольшой M3 demand, а не только жёсткий individual gate.

## Cluster simulation

Read-only engine copies находятся только в test-results/seo-simulation-{A,B,C}.ts; imports/dataset/rules unchanged. B включает existing individual gate OR tags PRODUCT/PACKAGING/APPLICATION/SPECIFICATION/B2B/TRANSACTIONAL/BRAND с Page+tag sum≥100. Query с несколькими tags учитывается один раз в selected summary. Другие thresholds/token-level action safeguards сохранены; C — диагностический upper bound. Simulation ничего не записывала.

| Model | Eligible Pages | Potential Actions (baseline types) | If only single-group+modern provisionally product | Risk |
| --- | --- | --- | --- | --- |
| A | 4 | 6 | 6 | ограниченная полнота; существующая semantics |
| B | 12 | 20 | 17 | specification spelling false positives + partial links |
| C | 20 | 26 | 23 | широкая Page сумма не подтверждает узкие actions |


Типовая provisional simulation использовала одну группу и modern evidence, не production correction formula; числа нельзя считать applied recommendations. B: 12 Pages / 20 actions; после provisional types 17. C:20 /26 (typed23). Current A:4 /6.

## Selected gate decision

**KEEP CURRENT**. Intent aggregation количественно расширяет input 4→12, но не подтверждена как качественная correction. B выдаёт SPECIFICATION для UTTO «10w30» при наличии «10W-30» и для двух карточек «5w40» при наличии «5W-40», а также ошибочный CONTENT_GAP на этих карточках при baseline category. Пунктуацию не меняем, словари/100 impressions/75% не снижаем. Широкий BRAND/PRODUCT cluster не доказывает отсутствие узкой specification или packaging. Следующий отдельно согласуемый tuning должен сначала обеспечить exact deterministic specification token equivalence и повторный quality audit; он не разработан в этом Round. Никакие simulated recommendations не сохранены.

## Structured data audit

Два независимых ограничения: (1) selected stored structuredDataJson пуст для high-impression sample, commercial.productSchema/offerSchema.present=false; (2) раньше modern products=0, A11 дополнительно requires product + sufficient individual query evidence + significant TRANSACTIONAL/B2B. После type correction modern product=470, полная A11 eligibility=0, schema actions=0. Type исправляет только первый rule gate, не Search intent.

Observed Product/Offer=0/0. У всех 633 modern mapped M3 Page stored types Product/Offer отсутствуют; все 470 corrected product snapshots missing both. Если все 633 mapped modern считать product, current A engine всё равно создаёт 0 schema actions; отдельная B/C provisional simulation не является текущей eligibility. Legacy product Pages без successful modern snapshot — unknown, не missing-schema defects.

Extractor распознаёт nested JSON-LD @graph/@type и schema.org itemtype; существующие local fixture tests покрывают Product/Offer и microdata. Raw HTML не сохранён, поэтому нельзя доказать физическое отсутствие schema или исключить unsupported JSON-LD spelling/invalid markup на production. Сохранённый extracted snapshot действительно не содержит types; новые production HTML requests для проверки не делались. Raw structuredDataJson/contentSignalsJson high-impression sample доступны в seo-tuning-audit.json, без чувствительных query values.

## Internal graph audit


| Graph segment | Pages |
| --- | --- |
| Universe (all active, включая без Search) | 1495 |
| Observed source (links !== null) | 665 |
| Target-only (без source snapshot, есть inbound) | 68 |
| Unobserved (нет source snapshot и inbound) | 762 |

Segments mutually exclusive:665+68+762=1495. Если «observed» означает только source snapshot, coverage=44.48%. Universe включает mapping/import/history Pages без successful scan и non-Search Pages; это не 1495 fully crawled Pages. HTML engine universe1493 исключает два documents.

Diesel Premium20L inbound0/outbound19/depth unknown. Проверка stored aliases не нашла проигнорированных alias-only graph links: 0, diesel alias inbound 0. Однако 830 Page без source observations могут содержать реальные inbound links. Поэтому подтвердить реальную orphan нельзя; **confidence LOW сохранён**, priority HIGH не тождественна confidence HIGH. Graph build используется только recalc/optional detail, ни один из пяти initial GET его не запускает.

## Lost match audit

11/11 причин объяснены, restored 0. Historical Page active у всех 11, successful ScanPage у всех 0. usablePageWhere требует active + some successful200–399; rematch демотировал прежние связи без такого evidence. Это согласованная прежняя safety policy, не новый normalization/alias bug. Сохранённый 404 — current saved result, не live probe. 502 нельзя автоматически назвать WAF. Нет новых requests и blind reattachment.

| URL | Latest stored result | Successful snapshots | Historical active | Disposition |
| --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-cutfluid-al-kanistra-20-l/ | 502 | 0 | YES | saved502 / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-turbine-oil-f-synth-ep-68-bochka-205-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-romil-220-bochka-205-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-cng-la-10w-40-kanistra-20-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-atf-dx-iii-standard-bochka-205-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-20-l/ | 404 | 0 | YES | saved404 / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-atf-dx-iii-bochka-205-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-red-40-kanistra-5-kg/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-atf-dx-iii-standard-kanistra-20-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-refrigerator-pao-68-fg-kub-1-000-l/ | 404 | 0 | YES | saved404 / unresolved |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-romil-100-bochka-205-l/ | нет снимка | 0 | YES | no successful snapshot / unresolved |

57 unresolved legacy numeric остаются без нового scan и не блокируют Round; matched rate сохраняется85.81%. Все 1163 raw Search URL сохранены.

## Performance reproduction

Round1 warm means15.74/.72/5.03/1.06/3.51s основаны на двух samples. Новая методика: warm-up вне статистики +5 sequential GET на каждый route, HTTP200, полное body, localhost production build; все замеры после завершения профайлеров/tests/build. Промежуточный нагруженный замер перезаписан последним полным isolated before, не используется как baseline. Различие старой systemic latency нельзя причинно приписать 716 snapshots: в before серии оно не воспроизводилось, после restart снова наблюдалось. Это нестабильность сравнения, а не доказательство устранения regression.

| Route | Before min/median/max/mean s | After min/median/max/mean s | Target mean s |
| --- | --- | --- | --- |
| / | 5.089 / 5.524 / 5.751 / 5.416 | 15.423 / 15.957 / 16.250 / 15.854 | 6 |
| /scanner | 0.283 / 0.342 / 0.377 / 0.341 | 0.649 / 0.663 / 0.752 / 0.683 | 1 |
| /seo-actions | 1.860 / 1.954 / 2.102 / 1.992 | 1.610 / 1.620 / 1.937 / 1.711 | 2.5 |
| /pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3 | 0.530 / 0.614 / 0.824 / 0.631 | 1.063 / 1.113 / 1.258 / 1.131 | 1.5 |
| /webmaster?period=M3 | 1.691 / 1.809 / 2.411 / 1.927 | 3.098 / 3.212 / 3.314 / 3.203 | 2.5 |


## Performance root cause

Same direct readonly route profiler, как Stabilization1, captures Prisma model calls/returned rows/SQL events, process CPU. Direct tsx profile timings отличаются от optimized standalone GET; SQL durations суммируются и могут перекрываться, CPU включает Prisma process threads. Нельзя суммировать их как exclusive request timeline. No SQL parameter values logged.

| Route | Stab model calls/rows | Before calls/rows/SQL ms/CPU ms | After calls/rows/SQL ms/CPU ms |
| --- | --- | --- | --- |
| / | 24 / 17807 | 25 / 17606 / 2437 / 9687 | 25 / 17606 / 1887 / 23312 |
| /scanner | 3 / 13 | 3 / 32 / 674 / 515 | 3 / 32 / 313 / 1782 |
| /seo-actions | 7 / 15766 | 7 / 15767 / 712 / 3030 | 6 / 11 / 586 / 1235 |
| /pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3 | 25 / 457 | 26 / 456 / 484 / 469 | 26 / 456 / 618 / 906 |
| /webmaster?period=M3 | 8 / 8 | 8 / 8 / 636 / 1344 | 8 / 8 / 571 / 2453 |

Raw SQL packet contains15756 Search observations; 11 model-result rows after SEO correction не означают11 Search rows. Before SEO full projection returned15756 rows, about2.05s in first route profile; reused analytics packet avoids per-row Prisma decoding. No full graph on saved SEO list.

| Isolated read-model stage (tsx) | Wall ms | Process CPU ms | SQL event sum ms |
| --- | --- | --- | --- |
| Dashboard business context | 2933 | 3860 | 977 |
| Dashboard Commerce + Search preparation | 12670 | 14687 | 299 |
| Dashboard businessQuality | 2035 | 2109 | 18 |
| Dashboard freshness (Scanner + integrations) | 188 | 78 | 106 |
| Dashboard saved SEO cards | 28 | 0 | 15 |
| SEO full Prisma Search projection | 4901 | 4922 | 793 |
| SEO existing analytics JSON transport | 1132 | 953 | 428 |
| JSON.parse JS instrumented analytics transport | 161 | — | — |
| Webmaster aggregate + intent classification | 2493 | 2703 | 0 |
| Optional graph build (not initial GET) | 2744 | 2921 | 0 |

Dashboard bottleneck — Commerce preparation/site-wide historical aggregation и BusinessContext/quality CPU, не SEO cards/freshness/graph. Direct live prepareDataset still constructs 1495 profiles and transactional comparisons even when current coverage incomplete; semantics не упрощались. JSON parse instrumented only JS analytics packet; native Prisma decode отдельно не доступен — model-call elapsed minus SQL является combined transport/native decode proxy, не pure parse.

Data volume reads: Dashboard compact latest/status/content snapshot metadata per active Page; Page360 one selected successful contentSignals plus five history metadata snapshots; Scanner compact30 history+scope metadata, no ScanPage; Webmaster and SEO no ScanPage reads. Snapshot helpers filter successful outcomes/status and orderBy scannedAt DESC in DB with take1 per Page, no JS history sorting. Prisma nested query strategy may fetch qualifying children internally before enforcing per-parent take; generated SQL saved in profiles. Selected latest relation reads by snapshot IDs; no helper loads all1071 full content/link snapshots or independently loads all716 new snapshots. Optional graph costs several seconds in tsx with modern links but is absent on measured initial GET. Rendering residual includes RSC serialization/network and scheduling; exclusive render CPU не измерялся.

## Performance fixes

1. SEO saved list now uses existing analyticsSearchDataset JSON transport. Same effectiveSearch precedence/period, identical15756 observations and5252 normalized queries verified. No repeated reads/Commerce/graph.
2. Dashboard freshness Scan queries select only finishedAt/id/status/lastError; configJson queues no longer decoded three times. Existing status policy preserved.
3. Intent matcher memoizes normalized literal needle рядом с существующим regex и проверяет includes до Unicode boundary test. Логически exact literal regex не может совпасть при отсутствии needle; полный M18 equivalence:94536 observations /5252 queries, все output поля одинаковы. Read-only paired profile old9908ms→new2738ms; dictionaries/tags/rules unchanged. Финальные before/after route measurements учитывают все три fixes.

Final target status: Dashboard mean15.854s — MISS (<6s); Scanner0.683s — PASS (<1s); SEO1.711s — PASS (<2.5s); Page3601.131s — PASS (<1.5s); Webmaster3.203s — MISS (<2.5s). Remaining Dashboard bottleneck: site-wide Commerce profile/transactional historical preparation и businessQuality; Webmaster: SQL transport/JSON reconstruction, effectiveSearch grouping и5252-query intent summary. Existing initial routes не строят graph. Высокая CPU/latency после restart наблюдается также у неизменённого Scanner, поэтому точная доля host/runtime влияния не установлена; причинность ScanPage growth не объявляется доказанной.

No schema, Redis, global data cache, new crawler or changed Commerce formula. Existing request classifier indexes preserved. No extra performance changes made where measurement did not justify semantics risk. Host load/compiler/runtime differences remain material; after targets assessed by measured means, not a latency guarantee.

## SEO before/after

Current M3 full eligibility4→4. Actions6→6; new0, removed0. No artificial quantity target or partial-graph confidence escalation. Scoring/priority formula, period and75% unchanged.

| Category | Before | After |
| --- | --- | --- |
| TITLE | 1 | 1 |
| DESCRIPTION | 3 | 3 |
| H1 | 1 | 1 |
| CONTENT | 0 | 0 |
| APPLICATION | 0 | 0 |
| SPECIFICATION | 0 | 0 |
| PACKAGING | 0 | 0 |
| INTERNAL_LINKING | 1 | 1 |
| STRUCTURED_DATA | 0 | 0 |
| CONTENT_GAP | 0 | 0 |
| CANNIBALIZATION | 0 | 0 |
| FIRST_SCREEN | 0 | 0 |


## Quality review

TOP20 **new stored** Actions содержит0 записей. Вместо заполнения фиктивными строками reviewed все6 current actions и14 proposed-new B actions (ни одна не persisted). Current chain: catalog/contacts description empty + individual Search demand; brand/packing facet title/H1 lacks significant«канистра» evidence +≥100 query; Diesel internal linking candidate observed0 inbound and256 M3 impressions, onlyLOW confidence. Facet latest self-indexable eligibility preserved, не исключён из-за URL shape.

| Simulation-new URL | Category | M3 demand / missing evidence | Review |
| --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/ | TITLE | 687 impressions; false | candidate only; no persistence |
| https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | SPECIFICATION | 372 impressions; 10w30:179 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | CONTENT_GAP | 372 impressions; 10w30:179 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | INTERNAL_LINKING | 372 impressions; 0 | LOW: partial graph, not verified orphan |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hvlp-32-bochka-205-l/ | INTERNAL_LINKING | 166 impressions; 0 | LOW: partial graph, not verified orphan |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | DESCRIPTION | 145 impressions; "see JSON" | candidate only; no persistence |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | H1 | 145 impressions; "see JSON" | candidate only; no persistence |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | SPECIFICATION | 197 impressions; 5w40:101 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | SPECIFICATION | 211 impressions; 5w40:100 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | CONTENT_GAP | 197 impressions; 5w40:101 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | CONTENT_GAP | 211 impressions; 5w40:100 | FAIL: token spelling/template artifact |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-20-l/ | INTERNAL_LINKING | 139 impressions; 0 | LOW: partial graph, not verified orphan |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | INTERNAL_LINKING | 197 impressions; 0 | LOW: partial graph, not verified orphan |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | INTERNAL_LINKING | 211 impressions; 0 | LOW: partial graph, not verified orphan |

Кластеры не приняты: хотя отдельные proposals разумны, три spelling false-positive specification rules и category artifacts нарушают требование explainable missing element. Tuning не объявлен успешным расширением query coverage.

## Commerce fixed-period validation

09.09–06.10.2026 read-only before/after type correction:14 Growth /3 Risk, RULE11=14,RULE16=3, RULE12–15/17–22=0. Historical result не сохранён как current. Existing Opportunities checksums unchanged. TRANSACTIONAL coverage10.01.2025–06.10.2026 сохранён;07.10+ unknown, не zero. kgPerUnit0/1909 без изменения, stockKg/days remain unknown. Current28 Growth0/Risk0 не оцениваются как улучшение.

## AI readiness

**ALMOST READY FOR AI**
1. Matching85.81%, modern653/710 и evidence-based470 product types обеспечивают проверяемую основу, но query-cluster расширение пока даёт false positives и текущий engine имеет только4 full-input Pages.
2. Commerce semantics стабильно подтверждены14 Growth/3 Risk на полностью покрытом периоде; отсутствующие kgPerUnit0/1909 ограничивают inventory conclusions, текущий coverage gap обусловлен отсутствием новой выгрузки.
3. Initial GET проверены отдельными warm samples, однако graph44.48% не доказывает real orphans, Product/Offer physical absence не подтверждена и результаты AI должны явно ограничиваться сохранённым evidence.
