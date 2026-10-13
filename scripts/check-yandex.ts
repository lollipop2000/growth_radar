import { db } from "../src/lib/db";
import { testIntegration } from "../src/lib/yandex/settings";
import { safeError } from "../src/lib/yandex/api";
import { mkdirSync, writeFileSync } from "node:fs";
const results: unknown[] = [];
try {
  for (const source of ["METRIKA", "WEBMASTER"] as const) {
    try {
      const c = await testIntegration(source);
      results.push({
        source,
        status: "PASS",
        ...(source === "METRIKA"
          ? {
              counterId: c.counterId,
              name: c.name,
              goals: c.goals,
              primaryGoals: c.primaryGoals,
            }
          : {
              userId: c.userId,
              hosts: c.hosts,
              selectedHost: c.hostId ?? null,
            }),
      });
    } catch (error) {
      results.push({
        source,
        status: "ERROR",
        error: safeError(error),
        counterId:
          source === "METRIKA"
            ? (process.env.YANDEX_METRIKA_COUNTER_ID ?? null)
            : undefined,
      });
    }
  }
  const report = {
    checkedAt: new Date().toISOString(),
    production: true,
    results,
  };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/yandex-production-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (results.some((v) => (v as { status: string }).status !== "PASS"))
    process.exitCode = 1;
} finally {
  await db.$disconnect();
}
