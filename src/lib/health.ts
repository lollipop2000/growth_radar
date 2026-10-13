import "server-only";
import { db } from "./db";
import { safeUrl, testConnection } from "./connection";
export const names = [
  "Database",
  "Target Site",
  "Yandex Metrika",
  "Yandex Webmaster",
  "LLM",
] as const;
export type HealthRow = {
  type: string;
  status: string;
  lastError: string | null;
  lastCheckedAt: Date | null;
};
export async function targetUrl(): Promise<string> {
  const saved = await db.integration.findUnique({
    where: { type: "Target Site" },
  });
  const config = saved?.configJson as { baseUrl?: string } | null;
  return config?.baseUrl ?? process.env.SITE_BASE_URL ?? "";
}
export async function saveTarget(value: string) {
  const baseUrl = safeUrl(value.trim()).href;
  await db.$transaction([
    db.site.upsert({
      where: { baseUrl },
      create: { name: "G-market", baseUrl },
      update: {},
    }),
    db.integration.upsert({
      where: { type: "Target Site" },
      create: {
        type: "Target Site",
        enabled: true,
        status: "Configured",
        configJson: { baseUrl },
      },
      update: {
        enabled: true,
        status: "Configured",
        lastCheckedAt: null,
        lastError: null,
        configJson: { baseUrl },
      },
    }),
  ]);
}
async function store(
  type: string,
  status: string,
  error: string | null,
  checked: Date,
) {
  const data = {
    status,
    lastError: error,
    lastCheckedAt: checked,
    enabled: status !== "Not configured",
  };
  await db.integration.upsert({
    where: { type },
    create: { type, ...data },
    update: data,
  });
}
export async function checkTarget() {
  const url = await targetUrl();
  if (!url) throw new Error("NOT_CONFIGURED");
  const raw = Number(process.env.SITE_TIMEOUT_MS ?? 15000);
  const timeoutMs = Number.isFinite(raw)
    ? Math.min(30000, Math.max(1000, raw))
    : 15000;
  const result = await testConnection(url, { timeoutMs });
  await store(
    "Target Site",
    result.error ? "Error" : "Connected",
    result.error,
    new Date(),
  );
  return result;
}
export async function checkSystem(): Promise<HealthRow[]> {
  const now = new Date();
  try {
    await db.$queryRaw`SELECT 1`;
    await store("Database", "Connected", null, now);
  } catch {
    return names.map((type) => ({
      type,
      status: "Error",
      lastError:
        type === "Database"
          ? "PostgreSQL недоступен. Проверьте сервер и миграции."
          : "Проверка недоступна без PostgreSQL.",
      lastCheckedAt: now,
    }));
  }
  const env = process.env;
  const configured: Record<string, boolean> = {
    "Yandex Metrika": Boolean(
      env.YANDEX_METRIKA_TOKEN && env.YANDEX_METRIKA_COUNTER_ID,
    ),
    "Yandex Webmaster": Boolean(env.YANDEX_WEBMASTER_TOKEN),
    LLM: Boolean(
      env.LLM_PROVIDER && env.LLM_API_URL && env.LLM_API_KEY && env.LLM_MODEL,
    ),
  };
  for (const [type, ready] of Object.entries(configured)) {
    const previous = await db.integration.findUnique({ where: { type } });
    if (type === "LLM" || !ready || !previous)
      await store(type, ready ? "Configured" : "Not configured", null, now);
  }
  if (await targetUrl()) await checkTarget();
  else await store("Target Site", "Not configured", null, now);
  return readSystem();
}
export async function readSystem(): Promise<HealthRow[]> {
  try {
    const rows = await db.integration.findMany({
      select: {
        type: true,
        status: true,
        lastError: true,
        lastCheckedAt: true,
      },
    });
    return names.map(
      (type) =>
        rows.find((row) => row.type === type) ?? {
          type,
          status: "Not configured",
          lastError: null,
          lastCheckedAt: null,
        },
    );
  } catch {
    return names.map((type) => ({
      type,
      status: type === "Database" ? "Error" : "Not configured",
      lastError:
        type === "Database"
          ? "PostgreSQL недоступен или миграции не применены."
          : null,
      lastCheckedAt: null,
    }));
  }
}
