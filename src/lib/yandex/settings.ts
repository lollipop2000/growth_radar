import "server-only";
import { db } from "../db";
import { targetUrl } from "../health";
import {
  metrikaApi,
  webmasterApi,
  safeError,
  ApiError,
  type YandexApi,
} from "./api";
import { inspectCounter, reportPage, type Goal } from "./metrika";
import { inspectWebmaster, type Host } from "./webmaster";
import { nextMoscowDay, yesterday } from "./dates";
import type { Prisma } from "@prisma/client";
import { goalConfig, reportGoalIds, validateGoalTypes, type GoalType } from "./goal-types";
export type Source = "METRIKA" | "WEBMASTER";
export const integrationType = (source: Source) =>
  source === "METRIKA" ? "Yandex Metrika" : "Yandex Webmaster";
export type IntegrationConfig = {
  priorityScope?: import("./priority").PriorityScope;
  discoveryUrls?: string[];
  siteId?: string;
  counterId?: string;
  name?: string;
  counterSite?: string | null;
  timeZone?: string | null;
  goals?: Goal[];
  primaryGoals?: string[];
  goalTypes?: Record<string, GoalType>;
  userId?: string;
  hosts?: Host[];
  hostId?: string;
  hostUrl?: string;
  webmasterUrlSource?: "WEBMASTER" | "ALL";
  dailyEnabled?: boolean;
  nextRunAt?: string;
  syncedThrough?: string;
};
export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function config(value: unknown): IntegrationConfig {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as IntegrationConfig)
    : {};
}
export async function currentSite() {
  const baseUrl = await targetUrl();
  if (!baseUrl) throw new ApiError("NOT_CONFIGURED");
  const existing=await db.site.findUnique({where:{baseUrl}});
  if(existing)return existing;
  return db.site.upsert({
    where: { baseUrl },
    create: { baseUrl, name: "G-market" },
    update: {},
  });
}
export async function readIntegration(source: Source) {
  return db.integration.findUnique({
    where: { type: integrationType(source) },
  });
}
export async function ensureIdle(source: Source) {
  const integration = await readIntegration(source);
  if (
    integration &&
    (await db.jobRun.findFirst({
      where: {
        integrationId: integration.id,
        status: {
          in: [
            "PENDING",
            "RUNNING",
            "WAITING_EXPORT",
            "WAITING_QUOTA",
            "PAUSED",
          ],
        },
      },
    }))
  )
    throw new Error("ACTIVE_SYNC");
}
async function persistIdle(
  source: Source,
  data: Omit<Prisma.IntegrationUncheckedCreateInput, "id" | "type">,
  expected?: unknown,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    if (source === "METRIKA") await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462302)`;
    const row = await tx.integration.findUnique({
      where: { type: integrationType(source) },
    });
    if (
      row &&
      (await tx.jobRun.findFirst({
        where: {
          integrationId: row.id,
          status: {
            in: [
              "PENDING",
              "RUNNING",
              "WAITING_EXPORT",
              "WAITING_QUOTA",
              "PAUSED",
            ],
          },
        },
      }))
    )
      throw new Error("ACTIVE_SYNC");
    if (
      expected !== undefined &&
      JSON.stringify(row?.configJson ?? {}) !== JSON.stringify(expected)
    )
      throw new Error("CONFIG_CHANGED");
    return tx.integration.upsert({
      where: { type: integrationType(source) },
      create: { type: integrationType(source), ...data },
      update: data,
    });
  });
}
export async function testIntegration(source: Source, api?: YandexApi) {
  await ensureIdle(source);
  const site = await currentSite(),
    previous = await readIntegration(source),
    old = config(previous?.configJson);
  let next: IntegrationConfig = { ...old };
  try {
    if (source === "METRIKA") {
      const info = await inspectCounter(
        api ?? metrikaApi(),
        process.env.YANDEX_METRIKA_COUNTER_ID ?? "",
      );
      await reportPage(
        api ?? metrikaApi(),
        info.counterId,
        yesterday(),
        [],
        1,
        1,
      );
      const same = old.counterId === info.counterId && old.siteId === site.id;
      next = {
        ...(same ? old : {}),
        siteId: site.id,
        ...info,
        counterSite: info.site,
        primaryGoals: same
          ? (old.primaryGoals ?? []).filter((g) =>
              info.goals.some((x) => x.id === g),
            )
          : [],
        goalTypes: goalConfig({ goals: info.goals, goalTypes: same ? old.goalTypes : {} }).goalTypes,
        dailyEnabled: same ? (old.dailyEnabled ?? true) : true,
        nextRunAt: old.nextRunAt ?? nextMoscowDay().toISOString(),
      };
      delete (next as Record<string, unknown>).site;
    } else {
      const info = await inspectWebmaster(api ?? webmasterApi());
      const same = old.siteId === site.id && old.userId === info.userId;
      next = {
        ...(same ? old : {}),
        siteId: site.id,
        ...info,
        dailyEnabled: same ? (old.dailyEnabled ?? true) : true,
        nextRunAt: old.nextRunAt ?? nextMoscowDay().toISOString(),
      };
      if (
        next.hostId &&
        !info.hosts.some((h) => h.id === next.hostId && h.verified)
      ) {
        delete next.hostId;
        delete next.hostUrl;
        delete next.syncedThrough;
        delete next.priorityScope;
        delete next.discoveryUrls;
      }
    }
    const data = {
      enabled: true,
      status: source === "WEBMASTER" && !next.hostId ? "WARNING" : "HEALTHY",
      lastError: null,
      lastCheckedAt: new Date(),
      configJson: json(next),
      ...(old.siteId !== next.siteId ||
      (source === "METRIKA" && old.counterId !== next.counterId)
        ? { lastSuccessfulSyncAt: null }
        : {}),
    };
    await persistIdle(source, data, previous?.configJson ?? {});
    return next;
  } catch (error) {
    if (
      error instanceof Error &&
      ["ACTIVE_SYNC", "CONFIG_CHANGED"].includes(error.message)
    )
      throw error;
    const data = {
      enabled: true,
      status: "ERROR",
      lastCheckedAt: new Date(),
      lastError: safeError(error),
    };
    await persistIdle(source, data);
    throw error;
  }
}
export async function savePrimaryGoals(selected: string[]) {
  await ensureIdle("METRIKA");
  const row = await readIntegration("METRIKA"),
    c = config(row?.configJson),
    site = await currentSite();
  const ids = Array.from(new Set(selected));
  if (
    !row ||
    c.siteId !== site.id ||
    c.counterId !== process.env.YANDEX_METRIKA_COUNTER_ID ||
    ids.length > 15 ||
    ids.some((g) => !c.goals?.some((v) => v.id === g))
  )
    throw new Error("INVALID_GOALS");
  if (reportGoalIds({ ...c, primaryGoals: ids }).length > 15) throw new Error("GOAL_REPORT_LIMIT");
  await persistIdle(
    "METRIKA",
    { configJson: json({ ...c, primaryGoals: ids }) },
    row.configJson,
  );
}
export async function saveGoalTypes(input: unknown) {
  await ensureIdle("METRIKA");
  const row = await readIntegration("METRIKA"), c = config(row?.configJson), site = await currentSite();
  if (!row || c.siteId !== site.id || c.counterId !== process.env.YANDEX_METRIKA_COUNTER_ID) throw new Error("INVALID_GOAL_TYPES");
  const types = validateGoalTypes(input, c.goals ?? []);
  if (reportGoalIds({ ...c, goalTypes: types }).length > 15) throw new Error("GOAL_REPORT_LIMIT");
  await persistIdle("METRIKA", { configJson: json({ ...c, goalTypes: types }) }, row.configJson);
}
export async function saveHost(hostId: string) {
  await ensureIdle("WEBMASTER");
  const row = await readIntegration("WEBMASTER"),
    c = config(row?.configJson),
    site = await currentSite();
  const chosen = c.hosts?.find((h) => h.id === hostId && h.verified);
  if (!row || !chosen || c.siteId !== site.id) throw new Error("INVALID_HOST");
  // Binding to another origin silently would mix two different sites' metrics.
  if (new URL(chosen.url).origin !== new URL(site.baseUrl).origin)
    throw new Error("HOST_MISMATCH");
  await persistIdle(
    "WEBMASTER",
    {
      status: "HEALTHY",
      lastError: null,
      ...(c.hostId !== hostId ? { lastSuccessfulSyncAt: null } : {}),
      configJson: json({
        ...c,
        hostId,
        hostUrl: chosen.url,
        ...(c.hostId !== hostId ? { syncedThrough: undefined, priorityScope: undefined, discoveryUrls: undefined } : {}),
      }),
    },
    row.configJson,
  );
}
export async function saveSchedule(source: Source, enabled: boolean) {
  await ensureIdle(source);
  const row = await readIntegration(source);
  if (!row) throw new ApiError("NOT_CONFIGURED");
  await persistIdle(
    source,
    {
      configJson: json({
        ...config(row.configJson),
        dailyEnabled: enabled,
        nextRunAt: nextMoscowDay().toISOString(),
      }),
    },
    row.configJson,
  );
}
