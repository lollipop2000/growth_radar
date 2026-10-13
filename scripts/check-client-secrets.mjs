import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const secretNames = [
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "YANDEX_METRIKA_TOKEN",
  "YANDEX_WEBMASTER_TOKEN",
  "LLM_API_KEY",
  "DEEPSEEK_API_KEY",
];
const values = secretNames
  .map((name) => process.env[name])
  .filter((value) => value && value.length >= 8);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
for (const file of files(".next/static")) {
  const content = readFileSync(file, "utf8");
  if (values.some((value) => content.includes(value)))
    throw new Error("Secret found in client build");
}
const routes = ["/", "/settings", "/system", "/scanner", "/pages", "/metrika", "/webmaster", "/webmaster/priority", "/webmaster/import", "/seo-actions", "/unmatched", "/unmatched?view=ROWS&source=METRIKA", "/imports", "/business-data", "/opportunities"];
if(process.env.OPPORTUNITY_CHECK_ID)routes.push(`/opportunities/${encodeURIComponent(process.env.OPPORTUNITY_CHECK_ID)}`);
if (process.env.PAGE360_CHECK_ID) routes.push(`/pages/${encodeURIComponent(process.env.PAGE360_CHECK_ID)}?period=30`);
if (process.env.TARGET_SCAN_CHECK_ID) routes.push(`/scanner/${encodeURIComponent(process.env.TARGET_SCAN_CHECK_ID)}`);
if (process.env.COVERAGE_SCAN_CHECK_ID) routes.push(`/scanner/${encodeURIComponent(process.env.COVERAGE_SCAN_CHECK_ID)}`);
for (const route of routes) {
  const response = await fetch(
    new URL(route, process.env.APP_URL || "http://127.0.0.1:3000"),
  );
  if (!response.ok) throw new Error(`Application route unavailable: ${route} HTTP ${response.status}`);
  const content = await response.text();
  if (values.some((value) => content.includes(value)))
    throw new Error("Secret found in rendered response");
}
console.log(
  "PASS: configured secrets absent from client assets and rendered responses.",
);

