import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { crawlUrl, normalizeUrl } from "./url";
import { emptyResult, type PageResult } from "./model";
import { DEFAULT_EXCLUDES } from "./browser";
const columns = [
  "URL",
  "Status Code",
  "Title",
  "Meta Description",
  "H1",
  "H2",
  "Canonical",
  "Robots",
  "Word Count",
] as const;
const key = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
function cell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value)
      throw new Error("Формулы не поддерживаются; экспортируйте значения.");
    if ("hyperlink" in value) return String(value.hyperlink);
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    throw new Error("Неподдерживаемый тип Excel cell.");
  }
  return String(value);
}
export type ImportResult = {
  pages: PageResult[];
  errors: string[];
  skipped: number;
  total: number;
};
export function validateArchive(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length)
    throw new Error("Некорректный XLSX ZIP.");
  const count = buffer.readUInt16LE(end + 10),
    size = buffer.readUInt32LE(end + 12),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 1000 || offset + size > end)
    throw new Error("XLSX archive превышает лимиты.");
  let position = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || buffer.readUInt32LE(position) !== 0x02014b50)
      throw new Error("Некорректный XLSX ZIP directory.");
    const length = buffer.readUInt32LE(position + 24);
    total += length;
    if (
      total > 20_000_000 ||
      length === 0xffffffff ||
      buffer.readUInt16LE(position + 8) & 1
    )
      throw new Error(
        "XLSX archive: максимум 20 MB после распаковки, без шифрования/ZIP64.",
      );
    position +=
      46 +
      buffer.readUInt16LE(position + 28) +
      buffer.readUInt16LE(position + 30) +
      buffer.readUInt16LE(position + 32);
  }
}
export async function parseCrawlImport(
  buffer: Buffer,
  filename: string,
  base: string,
): Promise<ImportResult> {
  if (buffer.byteLength > 5_000_000) throw new Error("Файл превышает 5 MB.");
  let rows: string[][];
  if (/\.csv$/i.test(filename)) {
    const input = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const headerLine = input.split(/\r?\n/, 1)[0];
    rows = parse(input, {
      delimiter: headerLine.includes(";") ? ";" : ",",
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 100_000,
      to: 52,
    });
  } else if (/\.xlsx$/i.test(filename)) {
    validateArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.columnCount > 50)
      throw new Error("Нет листа или более 50 колонок.");
    if (sheet.rowCount > 51)
      throw new Error("Первый acceptance: не более 50 строк данных.");
    rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const data: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++)
        data.push(cell(row.getCell(i).value));
      rows.push(data);
    });
  } else throw new Error("Поддерживаются только .xlsx и UTF-8 .csv.");
  if (!rows.length || rows.length > 51)
    throw new Error("Нужен заголовок и максимум 50 строк данных.");
  const headers = rows[0].map(key),
    indices = columns.map((column) => headers.indexOf(key(column)));
  if (indices.some((i) => i < 0) || new Set(headers).size !== headers.length)
    throw new Error("Нужны уникальные колонки: " + columns.join(", "));
  const pages: PageResult[] = [],
    errors: string[] = [],
    seen = new Set<string>();
  let skipped = 0;
  for (const [offset, row] of rows.slice(1).entries()) {
    try {
      if (row.some((v) => v.length > 10000))
        throw new Error("Значение превышает 10000 символов.");
      const data = Object.fromEntries(
        columns.map((column, i) => [column, (row[indices[i]] ?? "").trim()]),
      );
      const url = crawlUrl(data.URL, base, DEFAULT_EXCLUDES);
      if (!url) throw new Error("URL внешний, служебный или некорректный.");
      if (seen.has(normalizeUrl(url))) {
        skipped++;
        continue;
      }
      const statusCode = Number(data["Status Code"]);
      if (
        !/^\d{3}$/.test(data["Status Code"]) ||
        statusCode < 100 ||
        statusCode > 599
      )
        throw new Error("Status Code должен быть числом 100–599.");
      const wordCount = data["Word Count"] ? Number(data["Word Count"]) : null;
      if (
        wordCount !== null &&
        (!/^\d+$/.test(data["Word Count"]) ||
          !Number.isSafeInteger(wordCount) ||
          wordCount > 2147483647)
      )
        throw new Error("Word Count должен быть целым неотрицательным числом.");
      const canonical = data.Canonical
        ? normalizeUrl(data.Canonical, url)
        : null;
      const page: PageResult = {
        ...emptyResult(url, "IMPORT"),
        statusCode,
        title: data.Title || null,
        description: data["Meta Description"] || null,
        h1: data.H1 || null,
        h2Json: data.H2
          ? data.H2.split(/\r?\n|\s*;\s*/)
              .filter(Boolean)
              .slice(0, 100)
          : [],
        canonical,
        robots: data.Robots || null,
        wordCount,
        indexable:
          statusCode >= 200 &&
          statusCode < 300 &&
          !/noindex|none/i.test(data.Robots) &&
          (!canonical || canonical === normalizeUrl(url)),
        outcome:
          statusCode === 403
            ? "BLOCKED_BY_WAF"
            : statusCode === 401
              ? "AUTH_REQUIRED"
              : statusCode >= 400
                ? "ERROR"
                : "OK",
        error:
          statusCode === 403
            ? "Импортированный HTTP 403: BLOCKED_BY_WAF."
            : statusCode >= 400
              ? `Импортированный HTTP ${statusCode}`
              : null,
      };
      pages.push(page);
      seen.add(normalizeUrl(url));
    } catch (error) {
      errors.push(
        `Строка ${offset + 2}: ${error instanceof Error ? error.message : "Некорректная строка."}`,
      );
      skipped++;
    }
  }
  return { pages, errors, skipped, total: rows.length - 1 };
}
