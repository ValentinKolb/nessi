import { createLocalStorageStore, scheduler, type Scheduler, type ScheduleAfterCtx } from "@valentinkolb/sync-browser";
import { refreshMetadataProcess } from "./jobs/refresh-metadata.js";
import { consolidateMemoryProcess, incrementChatsSinceConsolidation } from "./jobs/consolidate-memory.js";
import { suggestTopicsProcess } from "./jobs/suggest-topics.js";
import { schedulerRepo, type SchedulerRun } from "./index.js";
import { settingsRepo } from "../settings/index.js";

const PREFIX = "nessi:bg";

export type JobRunLog = SchedulerRun;

/**
 * Create a scoped logger — every line gets `[nessi:bg <scope>]` prefix.
 * Declared with `function` (hoisted) so job modules importing it at top level
 * are safe against the circular import with this file.
 */
export function createLog(scope: string) {
  return (msg: string) => {
    console.debug(`[${PREFIX} ${scope}] ${msg}`);
    void schedulerRepo.pushLog(`[${new Date().toISOString()}] [${scope}] ${msg}`);
  };
}

export const log = createLog("scheduler");

export const pushJobLog = (entry: JobRunLog) => schedulerRepo.pushRun(entry);
export const getRunLog = () => schedulerRepo.listRuns();
export const getBackgroundLogs = () => schedulerRepo.listLogs();

let instance: Scheduler | null = null;

const retryOnError = (baseMs: number, maxMs: number, maxFailures = 3) =>
  async <R>({ ctx }: { ctx: ScheduleAfterCtx<R> }) => {
    if (ctx.error && ctx.failureCount < maxFailures) {
      ctx.reschedule({ delayMs: ctx.expBackoff({ baseMs, maxMs }) });
    }
  };

const registerSchedules = async (sched: Scheduler, cronConfig: Record<string, string>) => {
  // refresh-metadata — fanout dispatcher (per-chat retries live on processChatJob)
  await sched.create({
    id: "refresh-metadata",
    cron: cronConfig["refresh-metadata"]!,
    process: async ({ ctx }) => refreshMetadataProcess(ctx),
    after: retryOnError(30_000, 5 * 60_000),
  });
  log(`registered refresh-metadata (${cronConfig["refresh-metadata"]})`);

  // consolidate-memory — atomic; retry on provider/LLM failures
  await sched.create({
    id: "consolidate-memory",
    cron: cronConfig["consolidate-memory"]!,
    process: async ({ ctx }) => consolidateMemoryProcess(ctx),
    after: retryOnError(5 * 60_000, 60 * 60_000),
  });
  log(`registered consolidate-memory (${cronConfig["consolidate-memory"]})`);

  // suggest-topics — atomic; retry on provider/LLM failures
  await sched.create({
    id: "suggest-topics",
    cron: cronConfig["suggest-topics"]!,
    process: async ({ ctx }) => suggestTopicsProcess(ctx),
    after: retryOnError(5 * 60_000, 60 * 60_000),
  });
  log(`registered suggest-topics (${cronConfig["suggest-topics"]})`);
};

export const startScheduler = async () => {
  if (instance) return instance;

  log("starting scheduler");

  try {
    instance = scheduler({
      id: "nessi",
      store: createLocalStorageStore("nessi-sync"),
    });
    log("scheduler instance created");

    const cronConfig = await settingsRepo.getCronConfig();
    await registerSchedules(instance, cronConfig);

    instance.start();
    log("scheduler started");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${PREFIX} scheduler failed to start:`, msg, err);
    instance = null;
    return null;
  }

  void triggerMetadataRefresh();

  return instance;
};

export const stopScheduler = async () => {
  if (!instance) return;
  await instance.stop();
  instance = null;
  log("scheduler stopped");
};

/** Manually trigger a job — runs its scheduled process immediately without advancing cron. */
export const triggerJob = async (jobId: string) => {
  if (!instance) return;
  log(`manual trigger: ${jobId}`);
  try {
    await instance.runNow({ id: jobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`manual trigger failed: ${jobId} — ${msg}`);
  }
};

export const triggerMetadataRefresh = async () => {
  if (!instance) return;
  try {
    await instance.runNow({ id: "refresh-metadata" });
  } catch (err) {
    log(`trigger failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};

export const notifyChatProcessed = () => {
  incrementChatsSinceConsolidation();
};

/** Re-register a job with its current cron from settings (idempotent). */
export const reloadCron = async (jobId: string) => {
  if (!instance) return;
  const cronConfig = await settingsRepo.getCronConfig();
  try {
    // registerSchedules is idempotent — same id + new cron just updates the slot timing.
    await registerSchedules(instance, cronConfig);
    log(`reloaded cron for ${jobId}: ${cronConfig[jobId]}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`reloadCron failed for ${jobId}: ${msg}`);
  }
};

export const getScheduler = () => instance;
