import { DEFAULT_EXCLUDES } from "./browser";
export type ScanOptions = {
  mode: "HTTP" | "BROWSER";
  maxPages: number;
  concurrency: number;
  delayMs: number;
  timeoutMs: number;
  seeds: string[];
  excludes: string[];
  single: boolean;
  browserFallback: boolean;
  seedOnly?: boolean;
  continueOnError?: boolean;
};
export function scanOptions(raw: Partial<ScanOptions>): ScanOptions {
  const mode = raw.mode === "BROWSER" ? "BROWSER" : "HTTP";
  if (
    !Number.isInteger(raw.maxPages) ||
    raw.maxPages! < 1 ||
    raw.maxPages! > 50
  )
    throw new Error("Max Pages обязателен: 1–50 для первого acceptance.");
  const concurrency = mode === "BROWSER" ? 1 : (raw.concurrency ?? 1);
  const delayMs = raw.delayMs ?? 3000;
  if (![1, 2].includes(concurrency)) throw new Error("HTTP concurrency: 1–2.");
  if (
    !Number.isInteger(delayMs) ||
    delayMs < (mode === "BROWSER" ? 1000 : 500) ||
    delayMs > 60000
  )
    throw new Error("Browser delay: 1000–60000 ms; HTTP delay: 500–60000 ms.");
  return {
    mode,
    maxPages: raw.single ? 1 : raw.maxPages!,
    concurrency,
    delayMs,
    timeoutMs: mode === "BROWSER" ? 20000 : 15000,
    seeds: (raw.seeds ?? []).slice(0, 50),
    excludes: Array.from(
      new Set([
        ...DEFAULT_EXCLUDES,
        ...(raw.excludes ?? []).filter((v) => v.startsWith("/")),
      ]),
    ),
    single: Boolean(raw.single),
    browserFallback: raw.browserFallback !== false,
    seedOnly: Boolean(raw.seedOnly),
    continueOnError: Boolean(raw.continueOnError && raw.seedOnly),
  };
}
