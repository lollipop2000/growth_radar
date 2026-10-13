import "server-only";
import { db } from "../db";
import {
  ApiError,
  safeError,
  metrikaApi,
  webmasterApi,
  type YandexApi,
} from "./api";
import {
  config,
  currentSite,
  integrationType,
  json,
  readIntegration,
  type Source,
} from "./settings";
import {
  day,
  days,
  iso,
  nextMoscowDay,
  period,
  shift,
  yesterday,
} from "./dates";
import { reportPage } from "./metrika";
import { reportGoalIds } from "./goal-types";
import {
  availableDates,
  discoverUrlPage,
  downloadExport,
  downloadExportResult,
  exportStatus,
  hostPath,
  parseExport,
  submitExport,
} from "./webmaster";
import { rematchSite, saveMetrikaRows, saveWebmasterRows } from "./store";
import { safeDatasetUrl } from "./dataset";
const activeStatuses = [
  "PENDING",
  "RUNNING",
  "WAITING_EXPORT",
  "WAITING_QUOTA",
  "PAUSED",
];
export async function enqueueSync(
  source: Source,
  mode: "INITIAL" | "INCREMENTAL" | "SCHEDULED",
  length = 90,
  maxUrls?: number,
) {
  if (![7, 30, 90].includes(length)) throw new Error("INVALID_PERIOD");
  if (maxUrls !== undefined && (source !== "WEBMASTER" || mode !== "INITIAL" || !Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > 100))
    throw new Error("INVALID_URL_LIMIT");
  const site = await currentSite(),
    integration = await readIntegration(source),
    c = config(integration?.configJson);
  if (
    !integration ||
    c.siteId !== site.id ||
    !integration.lastCheckedAt ||
    !integration.enabled
  )
    throw new ApiError("NOT_CONFIGURED");
  if (source === "WEBMASTER" && !c.priorityScope?.urls.length) throw new Error("PRIORITY_SCOPE_REQUIRED");
  if (source === "WEBMASTER" && (c.priorityScope!.urls.length > 100 || c.priorityScope!.urls.some(url => safeDatasetUrl(url, site.baseUrl) !== url))) throw new Error("INVALID_MANUAL_SCOPE");
  const watermark = source === "WEBMASTER" ? c.priorityScope?.syncedThrough : c.syncedThrough;
  if (
    source === "METRIKA" &&
    (!process.env.YANDEX_METRIKA_TOKEN ||
      c.counterId !== process.env.YANDEX_METRIKA_COUNTER_ID)
  )
    throw new ApiError("NOT_CONFIGURED");
  if (
    source === "WEBMASTER" &&
    (!process.env.YANDEX_WEBMASTER_TOKEN ||
      !c.userId ||
      !c.hostId ||
      !c.hostUrl)
  )
    throw new ApiError("NOT_CONFIGURED");
  const to = yesterday(
      new Date(),
      source === "METRIKA" ? (c.timeZone ?? "Europe/Moscow") : "Europe/Moscow",
    ),
    from =
      mode === "INITIAL" || !watermark
        ? shift(to, 1 - (source === "METRIKA" ? 90 : length))
        : shift(watermark, 1);
  const noOp = from > to,
    dateTo = from <= to && daysBetween(from, to) > 90 ? shift(from, 89) : to;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    const current = await tx.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    if (
      JSON.stringify(current.configJson) !==
      JSON.stringify(integration.configJson)
    )
      throw new Error("CONFIG_CHANGED");
    if (
      await tx.jobRun.findFirst({
        where: {
          integrationId: integration.id,
          status: { in: activeStatuses },
        },
      })
    )
      throw new Error("ACTIVE_SYNC");
    if (source === "WEBMASTER" && await tx.jobRun.findFirst({ where: {
      integrationId: integration.id, siteId: site.id,
      status: { in: ["FAILED", "PARTIAL"] },
      checkpointJson: { path: ["phase"], equals: "SUBMITTING" },
    } })) throw new Error("EXPORT_SUBMISSION_UNCERTAIN");
    const job = await tx.jobRun.create({
      data: {
        siteId: site.id,
        integrationId: integration.id,
        source,
        mode,
        dateFrom: day(noOp ? to : from),
        dateTo: day(dateTo),
        configJson: json({
          counterId: c.counterId,
          primaryGoals: reportGoalIds(c),
          goalTypes: c.goalTypes,
          goals: c.goals,
          userId: c.userId,
          hostId: c.hostId,
            hostUrl: c.hostUrl,
            webmasterUrlSource: c.webmasterUrlSource ?? "ALL",
          noOp,
          requestedDays: length,
          maxUrls,
          ...(source === "WEBMASTER" ? { priorityScope: c.priorityScope, priorityUrls: c.priorityScope!.urls.slice(0, maxUrls ?? 100) } : {}),
        }),
      },
    });
    await tx.integration.update({
      where: { id: integration.id },
      data: { status: "SYNCING", lastError: null },
    });
    return job;
  });
}
function daysBetween(from: string, to: string) {
  return Math.round((day(to).getTime() - day(from).getTime()) / 86400000) + 1;
}
export async function scheduleDue(now = new Date()) {
  const site = await currentSite();
  for (const source of ["METRIKA", "WEBMASTER"] as Source[]) {
    const row = await readIntegration(source),
      c = config(row?.configJson);
    if (
      !row?.enabled ||
      c.siteId !== site.id ||
      !c.dailyEnabled ||
      !c.nextRunAt ||
      new Date(c.nextRunAt) > now ||
      !row.lastCheckedAt ||
      (source === "WEBMASTER" && !c.hostId)
    )
      continue;
    try {
      await enqueueSync(source, "SCHEDULED", source === "METRIKA" ? 90 : 7);
      await db.integration.update({
        where: { id: row.id },
        data: {
          configJson: json({
            ...c,
            nextRunAt: nextMoscowDay(now).toISOString(),
          }),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ACTIVE_SYNC") continue;
      const uncertain = error instanceof Error && error.message === "EXPORT_SUBMISSION_UNCERTAIN";
      await db.integration.update({
        where: { id: row.id },
        data: {
          status: uncertain ? "WARNING" : "ERROR",
          lastError: uncertain ? "EXPORT_SUBMISSION_UNCERTAIN: Проверьте ранее отправленную задачу в Вебмастере. Новый export не создан." : safeError(error),
          configJson: json({
            ...c,
            nextRunAt: nextMoscowDay(now).toISOString(),
          }),
        },
      });
    }
  }
}
export async function recoverJobs() {
  await db.jobRun.updateMany({
    where: {
      status: "RUNNING",
      heartbeatAt: { lt: new Date(Date.now() - 60000) },
    },
    data: { status: "PENDING", nextAttemptAt: new Date() },
  });
}
export async function claimJob() {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    if (await tx.jobRun.findFirst({ where: { status: "RUNNING" } }))
      return null;
    const job = await tx.jobRun.findFirst({
      where: {
        status: { in: ["PENDING", "WAITING_EXPORT", "WAITING_QUOTA"] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;
    await tx.jobRun.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        startedAt: job.startedAt ?? new Date(),
        heartbeatAt: new Date(),
      },
    });
    return job.id;
  });
}
type Checkpoint = {
  discoveredPathsCount?: number;
  dbRetries?: number;
  networkAttempts?: number;
  dayIndex?: number;
  phase?: string;
  paths?: string[];
  discoveryOffset?: number;
  dates?: string[];
  missingDates?: string[];
  pathIndex?: number;
  dateIndex?: number;
  taskId?: string | null;
  taskDates?: string[];
  taskSubmittedAt?: string;
  quotaRemaining?: number;
  quotaDay?: string;
  completedTasks?: number;
  completedExports?: {
    taskId: string;
    path: string;
    from: string;
    to: string;
    rows: number;
  }[];
  quotaUsed?: number;
};
export type JobDependencies = {
  metrika?: YandexApi;
  webmaster?: YandexApi;
  download?: (url: string) => Promise<string>;
};
async function waitJob(
  id: string,
  status: string,
  c: Checkpoint,
  at: Date,
  error?: string,
) {
  await db.jobRun.update({
    where: { id },
    data: {
      status,
      nextAttemptAt: at,
      checkpointJson: json(c),
      ...(error ? { errorsJson: [error] } : {}),
    },
  });
}
export async function finishJob(jobId: string, missingDates: string[] = []) {
  const job = await db.jobRun.findUniqueOrThrow({ where: { id: jobId } });
  const integration = await db.integration.findUniqueOrThrow({
      where: { id: job.integrationId },
    }),
    c = config(integration.configJson),
    snapshot = config(job.configJson);
  const same =
    c.siteId === job.siteId &&
    (job.source === "METRIKA"
      ? c.counterId === snapshot.counterId
      : c.hostId === snapshot.hostId);
  if (!same) throw new Error("BINDING_CHANGED");
  const status = missingDates.length ? "PARTIAL" : "COMPLETED",
    finishedAt = new Date();
  const checkpoint = job.checkpointJson as Checkpoint;
  const snapshotLimit = (job.configJson as { maxUrls?: number }).maxUrls;
  const priority = snapshot.priorityScope;
  const limited = job.source === "WEBMASTER" && !!snapshotLimit && (checkpoint.discoveredPathsCount ?? 0) > snapshotLimit;
  await rematchSite(job.siteId);
  await db.$transaction([
    db.jobRun.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt,
        durationMs: Math.min(
          2147483647,
          finishedAt.getTime() - (job.startedAt ?? job.createdAt).getTime(),
        ),
        errorsJson: missingDates.length
          ? [
              `DATA_NOT_AVAILABLE: Нет данных API за ${missingDates.join(", ")}; watermark не изменён.`,
            ]
          : limited ? [`LIMITED_SCOPE: Обработано ${snapshotLimit} из ${checkpoint.discoveredPathsCount} URL; общий watermark не изменён.`]
          : priority ? [`PRIORITY_SCOPE: Завершён выбранный scope ${priority.urls.length} URL; полнота всех URL host не требуется для MVP.`] : [],
      },
    }),
    db.integration.update({
      where: { id: integration.id },
      data: {
        status: missingDates.length || limited ? "WARNING" : "HEALTHY",
        lastError: missingDates.length
          ? "Часть дат API пока недоступна. Полная синхронизация не подтверждена."
          : limited ? "Ограниченная выборка URL синхронизирована. Полная выгрузка host ещё не завершена." : null,
        ...(missingDates.length
          ? {}
          : {
              lastSuccessfulSyncAt: finishedAt,
              ...(priority ? { configJson: json({ ...c, ...(c.priorityScope?.key === priority.key && !limited ? {
                priorityScope: { ...c.priorityScope, syncedThrough: c.priorityScope.syncedThrough && c.priorityScope.syncedThrough > iso(job.dateTo) ? c.priorityScope.syncedThrough : iso(job.dateTo) },
              } : {}) }) } : limited ? {} : { configJson: json({
                ...c,
                syncedThrough:
                  c.syncedThrough && c.syncedThrough > iso(job.dateTo)
                    ? c.syncedThrough
                    : iso(job.dateTo),
              }) }),
            }),
      },
    }),
  ]);
}
export async function processJob(jobId: string, deps: JobDependencies = {}) {
  const job = await db.jobRun.findUniqueOrThrow({
      where: { id: jobId },
      include: { site: true },
    }),
    cfg = job.configJson as {
      counterId: string;
      primaryGoals: string[];
      userId: string;
      hostId: string;
      hostUrl: string;
        noOp: boolean;
        webmasterUrlSource?: "WEBMASTER" | "ALL";
        maxUrls?: number;
        priorityUrls?: string[];
    },
    c = job.checkpointJson as Checkpoint;
  try {
    if (cfg.noOp) {
      await finishJob(jobId);
      return;
    }
    if (job.source === "METRIKA") {
      const all = days(iso(job.dateFrom), iso(job.dateTo)),
        index = c.dayIndex ?? 0;
      if (index >= all.length) {
        await finishJob(jobId);
        return;
      }
      const date = all[index],
        rows: Awaited<ReturnType<typeof reportPage>>["rows"] = [];
      let offset = 1,
        meta: unknown;
      for (;;) {
        const report = await reportPage(
          deps.metrika ?? metrikaApi(),
          cfg.counterId,
          date,
          cfg.primaryGoals,
          offset,
        );
        rows.push(...report.rows);
        meta = report.meta;
        if (rows.length > 200000) throw new ApiError("API_ERROR");
        if (rows.length >= report.total) break;
        if (!report.rows.length) throw new ApiError("MALFORMED_RESPONSE");
        offset += report.rows.length;
      }
      await saveMetrikaRows(jobId, rows, meta, { dayIndex: index + 1 });
      if (index + 1 === all.length) await finishJob(jobId);
      else await waitJob(jobId, "PENDING", { dayIndex: index + 1 }, new Date());
      return;
    }
    const api = deps.webmaster ?? webmasterApi(),
      path = hostPath(cfg.userId, cfg.hostId);
    if (c.phase === "SUBMITTING")
      throw new Error("EXPORT_SUBMISSION_UNCERTAIN");
    if (!c.paths) {
      const available = await availableDates(api, path),
        requested = days(iso(job.dateFrom), iso(job.dateTo));
      c.dates = requested.filter((d) => available.includes(d));
      c.missingDates = requested.filter((d) => !available.includes(d));
      if (cfg.priorityUrls) {
        if (!cfg.priorityUrls.length || cfg.priorityUrls.length > 100) throw new Error("INVALID_MANUAL_SCOPE");
        c.paths = exportPaths(cfg.priorityUrls, cfg.hostUrl);
        if (c.paths.length !== cfg.priorityUrls.length) throw new Error("INVALID_MANUAL_SCOPE");
        c.phase = "EXPORT";
        c.discoveredPathsCount = config(job.configJson).priorityScope?.urls.length ?? c.paths.length;
      } else {
      if (cfg.webmasterUrlSource === "WEBMASTER") c.paths = [];
      else {
      const pages = await db.page.findMany({
          where: { siteId: job.siteId },
          select: { url: true },
        }),
        metrika = await db.metrikaPageDaily.findMany({
          where: { siteId: job.siteId },
          distinct: ["url"],
          select: { url: true },
        });
      c.paths = exportPaths(
        [...pages, ...metrika].map((p) => p.url),
        cfg.hostUrl,
      );
      }
      c.discoveryOffset = 0;
      c.phase = "DISCOVERY";
      }
    }
    if (c.phase === "DISCOVERY") {
      const discovered = await discoverUrlPage(
        api,
        path,
        c.discoveryOffset ?? 0,
      );
      c.paths = Array.from(
        new Set([...c.paths, ...exportPaths(discovered.urls, cfg.hostUrl)]),
      );
      c.discoveryOffset = (c.discoveryOffset ?? 0) + discovered.urls.length;
      if (c.paths.length > 50000) throw new ApiError("API_ERROR");
      if (c.discoveryOffset < discovered.total) {
        if (!discovered.urls.length) throw new ApiError("MALFORMED_RESPONSE");
        await waitJob(jobId, "PENDING", c, new Date());
        return;
      }
      c.discoveredPathsCount = c.paths.length;
      const integration = await readIntegration("WEBMASTER"), current = config(integration?.configJson);
      if (integration && cfg.webmasterUrlSource === "WEBMASTER" && current.siteId === job.siteId && current.hostId === cfg.hostId) await db.integration.update({
        where: { id: integration.id }, data: { configJson: json({ ...current, discoveryUrls: c.paths.map(p => new URL(p, cfg.hostUrl).href) }) },
      });
      if (cfg.maxUrls) c.paths = c.paths.slice(0, cfg.maxUrls);
      c.phase = "EXPORT";
    }
    const dates = c.dates ?? [],
      paths = c.paths ?? [];
    if (!paths.length || !dates.length) {
      await finishJob(jobId, c.missingDates);
      return;
    }
    if (c.taskId) {
      const result = await exportStatus(api, path, c.taskId);
      if (result.status === "FAILED") throw new ApiError("API_ERROR");
      if (result.status === "IN_PROGRESS") {
        if (
          c.taskSubmittedAt &&
          Date.now() - new Date(c.taskSubmittedAt).getTime() > 48 * 3600000
        )
          throw new ApiError("TIMEOUT");
        await waitJob(
          jobId,
          "WAITING_EXPORT",
          c,
          new Date(Date.now() + 5 * 60000),
        );
        return;
      }
      const loaded = deps.download ? { csv: await deps.download(result.url!), transport: "HTTP" } : await downloadExportResult(result.url!);
      Object.assign(c, await storeExportChunk(jobId, loaded.csv, c.taskId, loaded.transport === "BROWSER"));
    }
    if ((c.pathIndex ?? 0) >= paths.length) {
      await finishJob(jobId, c.missingDates);
      return;
    }
    if (!cfg.priorityUrls) {
      await waitJob(jobId, "PAUSED", c, new Date(), "PRIORITY_SCOPE_REQUIRED: Старое задание сохранено; новый export POST не создан. Выберите Priority Scope.");
      return;
    }
    const quotaDay = shift(yesterday(), 1);
    if (c.quotaDay !== quotaDay) {
      c.quotaDay = quotaDay;
      c.quotaRemaining = 100;
    }
    if ((c.quotaRemaining ?? 100) <= 0) {
      await waitJob(
        jobId,
        "WAITING_QUOTA",
        c,
        nextMoscowDay(),
        safeError(new ApiError("QUOTA_EXCEEDED")),
      );
      return;
    }
    c.taskDates = dates.slice(
      c.dateIndex ?? 0,
      (c.dateIndex ?? 0) + Math.min(90, c.quotaRemaining ?? 100),
    );
    c.phase = "SUBMITTING";
    await db.jobRun.update({
      where: { id: jobId },
      data: { checkpointJson: json(c) },
    });
    let task: Awaited<ReturnType<typeof submitExport>>;
    try {
      task = await submitExport(
        api,
        path,
        c.taskDates,
        paths[c.pathIndex ?? 0],
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "QUOTA_EXCEEDED") {
        c.phase = "EXPORT";
        c.quotaRemaining = 0;
        await waitJob(
          jobId,
          "WAITING_QUOTA",
          c,
          nextMoscowDay(),
          safeError(error),
        );
        return;
      }
      throw error;
    }
    c.phase = "EXPORT";
    c.taskId = task.taskId;
    c.taskSubmittedAt = new Date().toISOString();
    c.quotaRemaining = task.remaining;
    c.quotaUsed = (c.quotaUsed ?? 0) + task.quotaUsed;
    await waitJob(jobId, "WAITING_EXPORT", c, new Date(Date.now() + 5 * 60000));
  } catch (error) {
    const dbCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["P1001", "P1002", "P2024", "P2028", "P2034"].includes(dbCode) && (c.dbRetries ?? 0) < 3) {
      c.dbRetries = (c.dbRetries ?? 0) + 1;
      await waitJob(jobId, "PENDING", c, new Date(Date.now() + 30000), safeError(error));
      return;
    }
    if (job.source === "WEBMASTER" && c.phase === "DISCOVERY" &&
      error instanceof ApiError && ["NETWORK", "TIMEOUT"].includes(error.code) && (c.networkAttempts ?? 0) < 12) {
      c.networkAttempts = (c.networkAttempts ?? 0) + 1;
      await waitJob(jobId, "PENDING", c, new Date(Date.now() + 5 * 60000), safeError(error));
      await db.integration.update({ where: { id: job.integrationId }, data: { status: "SYNCING", lastError: safeError(error) } });
      return;
    }
    // A saved export task can safely be polled/downloaded again. Keep its ID
    // during transient transport failures instead of spending quota on a new POST.
    if (
      job.source === "WEBMASTER" && c.taskId &&
      error instanceof ApiError && ["NETWORK", "TIMEOUT"].includes(error.code) &&
      c.taskSubmittedAt && Date.now() - new Date(c.taskSubmittedAt).getTime() < 48 * 3600000
    ) {
      await waitJob(jobId, "WAITING_EXPORT", c, new Date(Date.now() + 5 * 60000), safeError(error));
      await db.integration.update({
        where: { id: job.integrationId },
        data: { status: "SYNCING", lastError: safeError(error) },
      });
      return;
    }
    const message =
      error instanceof Error && error.message === "EXPORT_SUBMISSION_UNCERTAIN"
        ? "EXPORT_SUBMISSION_UNCERTAIN: Worker прерван при создании export. Проверьте задания и квоту в Вебмастере перед новым sync."
        : safeError(error) +
          (c.phase === "SUBMITTING"
            ? " Создание export не подтверждено; проверьте задания и квоту в Вебмастере перед новым sync."
            : "");
    const current = await db.jobRun.findUniqueOrThrow({ where: { id: jobId } }),
      finishedAt = new Date();
    await db.$transaction([
      db.jobRun.update({
        where: { id: jobId },
        data: {
          status: current.rowsSaved ? "PARTIAL" : "FAILED",
          finishedAt,
          durationMs: Math.min(
            2147483647,
            finishedAt.getTime() -
              (current.startedAt ?? current.createdAt).getTime(),
          ),
          errorsJson: [message],
        },
      }),
      db.integration.update({
        where: { id: job.integrationId },
        data: {
          status: current.rowsSaved ? "WARNING" : "ERROR",
          lastError: message,
        },
      }),
    ]);
    console.error(`Yandex ${job.source}: ${message}`);
  }
}
export function exportPaths(urls: string[], hostUrl: string) {
  const origin = new URL(hostUrl).origin;
  return Array.from(
    new Set(
      urls.flatMap((raw) => {
        try {
          const u = new URL(raw, hostUrl);
          return u.origin === origin && !u.username && !u.password
            ? [u.pathname + u.search]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ).sort();
}
export async function storeExportChunk(jobId: string, csv: string, taskId: string, browserDownload = false) {
  const job = await db.jobRun.findUniqueOrThrow({ where: { id: jobId } });
  const c = job.checkpointJson as Checkpoint;
  const cfg = config(job.configJson);
  if (job.source !== "WEBMASTER" || job.status !== "RUNNING" || c.taskId !== taskId || !cfg.hostUrl)
    throw new Error("EXPORT_NOT_RESUMABLE");
  const records = parseExport(csv, cfg.hostUrl, c.taskDates ?? [], c.paths?.[c.pathIndex ?? 0]);
  c.completedExports = [...(c.completedExports ?? []), {
    taskId, path: c.paths?.[c.pathIndex ?? 0] ?? "", from: c.taskDates?.[0] ?? "",
    to: c.taskDates?.at(-1) ?? "", rows: records.length,
  }];
  for (const record of records) record.rawJson = {
    ...record.rawJson, export_task_id: taskId,
    ...(browserDownload ? { download_transport: "BROWSER" } : {}),
  };
  c.dateIndex = (c.dateIndex ?? 0) + (c.taskDates?.length ?? 0);
  if (c.dateIndex >= (c.dates?.length ?? 0)) { c.dateIndex = 0; c.pathIndex = (c.pathIndex ?? 0) + 1; }
  c.taskId = null; c.taskDates = []; c.completedTasks = (c.completedTasks ?? 0) + 1;
  await saveWebmasterRows(jobId, records, c);
  return c;
}
export async function cancelJob(id: string) {
  await db.jobRun.updateMany({
    where: {
      id,
      status: { in: activeStatuses.filter((s) => s !== "RUNNING") },
    },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      errorsJson: [
        "Отменено пользователем. Уже сохранённые данные остаются; export в Яндексе не удаляется.",
      ],
    },
  });
  const job = await db.jobRun.findUnique({ where: { id } });
  if (job?.status === "CANCELLED")
    await db.integration.update({
      where: { id: job.integrationId },
      data: {
        status: "WARNING",
        lastError: "Sync отменён. Полнота данных не подтверждена.",
      },
    });
}
export async function resumeExport(id: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    const job = await tx.jobRun.findUniqueOrThrow({ where: { id }, include: { integration: true } });
    const checkpoint = job.checkpointJson as Checkpoint;
    const saved = config(job.configJson), current = config(job.integration.configJson);
    if (job.source !== "WEBMASTER" || !["FAILED", "PARTIAL"].includes(job.status) ||
      !checkpoint.taskId || checkpoint.phase !== "EXPORT") throw new Error("EXPORT_NOT_RESUMABLE");
    if (current.siteId !== job.siteId || current.hostId !== saved.hostId ||
      current.userId !== saved.userId) throw new Error("CONFIG_CHANGED");
    if (await tx.jobRun.findFirst({ where: { integrationId: job.integrationId, status: { in: activeStatuses } } }))
      throw new Error("ACTIVE_SYNC");
    await tx.integration.update({ where: { id: job.integrationId }, data: { status: "SYNCING", lastError: null } });
    return tx.jobRun.update({ where: { id }, data: {
      status: "PENDING", finishedAt: null, nextAttemptAt: new Date(), errorsJson: [],
    } });
  });
}
export async function resumeMetrika(id: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    const job = await tx.jobRun.findUniqueOrThrow({ where: { id }, include: { integration: true } });
    const saved = config(job.configJson), current = config(job.integration.configJson);
    if (job.source !== "METRIKA" || !["FAILED", "PARTIAL"].includes(job.status)) throw new Error("EXPORT_NOT_RESUMABLE");
    if (job.siteId !== current.siteId || saved.counterId !== current.counterId ||
      JSON.stringify(saved.primaryGoals) !== JSON.stringify(reportGoalIds(current))) throw new Error("CONFIG_CHANGED");
    if (await tx.jobRun.findFirst({ where: { integrationId: job.integrationId, status: { in: activeStatuses } } }))
      throw new Error("ACTIVE_SYNC");
    await tx.integration.update({ where: { id: job.integrationId }, data: { status: "SYNCING", lastError: null } });
    return tx.jobRun.update({ where: { id }, data: { status: "PENDING", finishedAt: null, nextAttemptAt: new Date(), errorsJson: [] } });
  });
}
