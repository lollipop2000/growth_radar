import { formats, type BusinessKind } from "./formats";
import { validateRows, type Sheet, type BusinessRow, type Mapping } from "./import";
import type { MatchPage } from "../yandex/matching";
import { normalizeUrl } from "../scanner/url";

export type ProductMapping = { sku: string; productGroup: string; productName: string; rawUrl: string; active: boolean; kgPerUnit?: number | null; brand?: string | null; category?: string | null };
type MappingRecord = { sku: string | null; productGroup: string | null; productName: string | null; rawUrl: string | null; brand: string | null; category: string | null; attributesJson: unknown; kgPerUnit?: unknown };
// Input is ordered newest first. Each new mapping version replaces only its SKU.
export function mappingRegistry(rows: MappingRecord[]): ProductMapping[] {
  const bySku = new Map<string, ProductMapping>();
  for (const r of rows) if (r.sku && r.productGroup && r.productName && r.rawUrl && !bySku.has(r.sku)) {
    const active = (r.attributesJson as { active?: boolean | string })?.active;
    bySku.set(r.sku, { sku: r.sku, productGroup: r.productGroup, productName: r.productName, rawUrl: r.rawUrl, kgPerUnit:r.kgPerUnit==null?null:Number(r.kgPerUnit), brand: r.brand, category: r.category, active: active !== false && active !== "false" });
  }
  return [...bySku.values()];
}
const header = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
export function typedMapping(sheet: Sheet, kind: BusinessKind) {
  const columns = formats[kind].columns;
  const indices = Object.fromEntries(columns.flatMap(c => {
    const matches = sheet.headers.flatMap((h, i) => header(h) === header(c.name) ? [i] : []);
    if (matches.length > 1) throw new Error(`Повторяется колонка «${c.name}».`);
    if (!matches.length && c.required) throw new Error(`Отсутствует обязательная колонка «${c.name}».`);
    return matches.length ? [[c.name, matches[0]]] : [];
  }));
  if (kind === "SALES" && !["Заказы", "Количество", "Количество кг", "Выручка"].some(c => indices[c] !== undefined)) throw new Error("Для продаж нужна хотя бы одна колонка: Заказы, Количество, Количество кг или Выручка.");
  const mapping: Mapping = Object.fromEntries(columns.flatMap(c => c.field && indices[c.name] !== undefined ? [[c.field, indices[c.name]]] : []));
  return { mapping, indices };
}
export function validateTypedRows(sheet: Sheet, kind: BusinessKind, base: string, pages: MatchPage[], registry: ProductMapping[]) {
  const { mapping, indices } = typedMapping(sheet, kind);
  const result = validateRows(sheet, mapping, "DMY", "RU", base, pages);
  const errors = [...result.errors], records: BusinessRow[] = [], products = new Map(registry.map(r => [r.sku, r]));
  const unknownSkuCount = kind === "MAPPING" ? 0 : new Set(sheet.rows.map(row => (row[indices.SKU] ?? "").trim()).filter(sku => sku && !products.has(sku))).size;
  const cell = (r: BusinessRow, name: string) => (sheet.rows[r.rowNumber - 2][indices[name]] ?? "").trim();
  for (const r of result.records) {
    try {
      for (const c of formats[kind].columns.filter(c => c.required)) if (!cell(r, c.name)) throw new Error(`Не заполнена обязательная колонка «${c.name}».`);
      if (kind === "SALES" && !["orders", "quantity", "quantityKg", "revenue"].some(k => r[k as keyof BusinessRow] != null)) throw new Error("Не заполнен ни один показатель продаж.");
      r.attributesJson = { ...r.attributesJson, businessKind: kind };
      if (kind === "MAPPING") {
        const raw = cell(r, "Активность").toLowerCase();
        if (raw && !["да", "нет", "true", "false", "1", "0"].includes(raw)) throw new Error("Активность: Да/Нет, true/false или 1/0.");
        // activity is mapping metadata, never product availability.
        r.attributesJson.active = String(!["нет", "false", "0"].includes(raw));
        const url = new URL(String(r.rawUrl));
        if (!["http:", "https:"].includes(url.protocol) || url.origin !== new URL(base).origin || url.username || url.password) throw new Error("URL магазина должен быть полным HTTP/HTTPS URL выбранного магазина без учётных данных.");
      } else {
        const product = products.get(String(r.sku));
        if (!product) throw new Error("SKU не найден в маппинге товаров.");
        // Resolve through the same existing URL matcher; don't create pages.
        const linked = validateRows({ name: "Связь", headers: ["SKU", "URL"], rows: [[product.sku, product.rawUrl]] }, { sku: 0, rawUrl: 1 }, "DMY", "RU", base, pages).records[0];
        Object.assign(r, { rawUrl: linked.rawUrl, normalizedUrl: linked.normalizedUrl, pageId: linked.pageId, matchStatus: linked.matchStatus, productGroup: product.productGroup, productName: product.productName, brand: product.brand ?? null, category: product.category ?? null });
      }
      records.push(r);
    } catch (e) { errors.push({ row: r.rowNumber, message: e instanceof Error ? e.message : "Ошибка строки." }); }
  }
  // Show all duplicate keys as errors, including identical rows skipped by legacy validation.
  const keys = new Map<string, number[]>();
  for (const r of records) {
    const dimensions = kind === "STOCK" ? [cell(r, "Склад"), cell(r, "Регион"), cell(r, "Единица измерения")] : kind === "PRICES" ? [cell(r, "Тип цены"), cell(r, "Валюта")] : [];
    const key = JSON.stringify([r.sku, kind === "MAPPING" ? null : r.date, ...dimensions]);
    keys.set(key, [...keys.get(key) ?? [], r.rowNumber]);
  }
  const badRows = new Set<number>();
  for (const rows of keys.values()) if (rows.length > 1) for (const row of rows) { badRows.add(row); errors.push({ row, message: kind === "MAPPING" ? "Дублируется SKU: один SKU не должен относиться к двум активным групповым кодам. Оставьте одну актуальную строку." : "Дублируется SKU и ключ строки. Объедините или исправьте строки перед импортом." }); }
  // Exact duplicates were skipped by validateRows. Keep that fact visible, not silent.
  const exact = new Map<string, number>();
  for (const [i, row] of sheet.rows.entries()) if (row.some(v => v.trim())) {
    const key = JSON.stringify(row), previous = exact.get(key);
    if (previous != null) { badRows.add(previous); badRows.add(i + 2); errors.push({ row: previous, message: `Строка дублируется строкой ${i + 2}.` }, { row: i + 2, message: `Дубликат строки ${previous}.` }); } else exact.set(key, i + 2);
  }
  if (kind === "MAPPING") {
    const proposed = records.filter(r => !badRows.has(r.rowNumber));
    const touched = new Set(proposed.map(r => String(r.sku)));
    const combined = [...registry.filter(r => !touched.has(r.sku)), ...proposed.map(r => ({ sku: String(r.sku), productGroup: String(r.productGroup), rawUrl: String(r.rawUrl), active: r.attributesJson.active !== "false" }))];
    const groupUrls = new Map<string, Set<string>>();
    for (const r of combined.filter(r => r.active)) groupUrls.set(r.productGroup, new Set([...(groupUrls.get(r.productGroup) ?? []), normalizeUrl(r.rawUrl, base)]));
    for (const r of proposed) if (r.attributesJson.active !== "false" && (groupUrls.get(String(r.productGroup))?.size ?? 0) > 1) {
      badRows.add(r.rowNumber); errors.push({ row: r.rowNumber, message: "Один групповой код не должен иметь несколько активных URL." });
    }
  }
  const accepted = records.filter(r => !badRows.has(r.rowNumber));
  for (const e of errors) if (!(sheet.rows[e.row - 2][indices.SKU] ?? "").trim()) e.message = "Не заполнена обязательная колонка «SKU».";
  if(kind!=="MAPPING")for(const [i,row] of sheet.rows.entries()) {
    const sku=(row[indices.SKU]??"").trim();
    if(sku&&!products.has(sku)&&!errors.some(e=>e.row===i+2&&e.message==="SKU не найден в маппинге товаров."))errors.push({row:i+2,message:"SKU не найден в маппинге товаров."});
  }
  return { ...result, skipped: sheet.rows.filter(row => row.every(v => !v.trim())).length, records: accepted, errors: errors.sort((a, b) => a.row - b.row), unknownSkuCount, matched: accepted.filter(r => r.pageId).length, unmatched: accepted.filter(r => !r.pageId).length };
}
