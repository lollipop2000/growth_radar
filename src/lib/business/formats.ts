import type { Field } from "./import";

export const kinds = ["MAPPING", "STOCK", "PRICES", "SALES"] as const;
export type BusinessKind = typeof kinds[number];
export type Column = { name: string; field?: Field; required: boolean; format: string; example: string | number; description: string };
export type Format = { title: string; purpose: string; download: string; filename: string; columns: Column[] };
const sku: Column = { name: "SKU", field: "sku", required: true, format: "Текст", example: "100001", description: "Уникальный артикул SKU из 1С. Ведущие нули сохраняются." };
const date: Column = { name: "Дата", field: "date", required: true, format: "ДД.ММ.ГГГГ или YYYY-MM-DD", example: "06.10.2026", description: "Дата состояния данных. Поддерживаются также ячейки Excel с датой." };
export const formats: Record<BusinessKind, Format> = {
  MAPPING: { title: "Маппинг товаров", purpose: "Связывает SKU с групповым кодом и страницей интернет-магазина.", download: "Скачать шаблон маппинга", filename: "product_mapping_template.xlsx", columns: [
    sku,
    { name: "Групповой код", field: "productGroup", required: true, format: "Текст", example: "GC000123", description: "Код агрегатора товара в интернет-магазине." },
    { name: "Наименование группового кода", field: "productName", required: true, format: "Текст", example: "G-Profi MSI 10W-40, бочка 205 л", description: "Наименование продукта и фасовки." },
    { name: "URL магазина", field: "rawUrl", required: true, format: "Полный HTTP/HTTPS URL", example: "https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-bochka-205-l/", description: "Ссылка на карточку товара в выбранном магазине." },
    { name: "Бренд", field: "brand", required: false, format: "Текст", example: "Газпромнефть", description: "Бренд товара." },
    { name: "Категория", field: "category", required: false, format: "Текст", example: "Моторные масла", description: "Категория товара." },
    { name: "Активность", required: false, format: "Да/Нет, true/false или 1/0", example: "Да", description: "Активность связи SKU с групповым кодом. Пустое значение означает Да." },
    { name: "Кг в единице SKU", field:"kgPerUnit", required:false, format:"Положительное число", example:180, description:"Масса одной учетной единицы SKU в кг. Значение используется для перевода остатка в штуках в килограммы и расчёта запаса в днях. Только явное значение; не выводится из фасовки." },
  ] },
  STOCK: { title: "Остатки", purpose: "Загружает текущие или исторические остатки по SKU.", download: "Скачать шаблон остатков", filename: "stock_template.xlsx", columns: [
    sku, { ...date, description: "Дата состояния остатка." },
    { name: "Остаток", field: "stock", required: true, format: "Неотрицательное число", example: 140, description: "Количество доступного товара." },
    { name: "Склад", required: false, format: "Текст", example: "Основной", description: "Склад, для которого указан остаток." },
    { name: "Регион", required: false, format: "Текст", example: "Москва", description: "Регион хранения товара." },
    { name: "Единица измерения", required: false, format: "Текст", example: "шт", description: "Единица измерения остатка." },
  ] },
  PRICES: { title: "Цены", purpose: "Загружает цену по каждому SKU.", download: "Скачать шаблон цен", filename: "prices_template.xlsx", columns: [
    sku, { ...date, description: "Дата действия цены." },
    { name: "Цена", field: "price", required: true, format: "Неотрицательное число", example: 54800, description: "Цена SKU. Допускаются 54800, 54800,50 и 54800.50." },
    { name: "Тип цены", required: false, format: "Текст", example: "Розничная", description: "Вид цены, например розничная или оптовая." },
    { name: "Валюта", required: false, format: "Текст", example: "RUB", description: "Код валюты. Валюты не конвертируются автоматически." },
  ] },
  SALES: { title: "Продажи", purpose: "Загружает историю продаж по SKU для сравнения периодов и анализа падения или роста продаж.", download: "Скачать шаблон продаж", filename: "sales_template.xlsx", columns: [
    { ...date, example: "01.10.2026", description: "Дата продажи." }, sku,
    { name: "Заказы", field: "orders", required: false, format: "Неотрицательное число", example: 2, description: "Количество заказов. Нужен хотя бы один показатель продаж." },
    { name: "Количество", field: "quantity", required: false, format: "Неотрицательное число", example: 5, description: "Количество проданных единиц." },
    { name: "Количество кг", field: "quantityKg", required: false, format: "Неотрицательное число", example: 1025, description: "Объём продаж в килограммах." },
    { name: "Выручка", field: "revenue", required: false, format: "Неотрицательное число", example: 274000, description: "Сумма продаж. Допускаются запятая и точка как десятичный разделитель." },
  ] },
};
export function businessKind(value: unknown): BusinessKind {
  if (!kinds.includes(value as BusinessKind)) throw new Error("Выберите тип бизнес-данных.");
  return value as BusinessKind;
}

