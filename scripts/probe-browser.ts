import { BrowserReader } from "../src/lib/scanner/browser";
import { mkdir, writeFile } from "node:fs/promises";
const reader = new BrowserReader();
try {
  const url = "https://shop.gazpromneft-sm.ru/";
  const result = await reader.read(url, url, new AbortController().signal);
  const { html, ...report } = result;
  const summary = {
    checkedAt: new Date().toISOString(),
    maxPages: 1,
    source: "BROWSER",
    ...report,
    htmlBytes: Buffer.byteLength(html),
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/browser-probe.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await reader.close();
}
