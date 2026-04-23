import { createLocalStorageStore, scheduler, type Scheduler } from "@valentinkolb/sync-browser";
import { refreshMetadataJob } from "./jobs/refresh-metadata.js";
import { consolidateMemoryJob, incrementChatsSinceConsolidation } from "./jobs/consolidate-memory.js";
import { suggestTopicsJob } from "./jobs/suggest-topics.js";
import { schedulerRepo, type SchedulerRun } from "./index.js";
import { settingsRepo } from "../settings/index.js";

const PREFIX = "[nessi:bg]";

export type JobRunLog = SchedulerRun;

export const log = (msg: string) => {
  console.debug(`${PREFIX} ${msg}`);
  void schedulerRepo.pushLog(`[${new Date().toISOString()}] ${msg}`);
};

export const pushJobLog = (entry: JobRunLog) => schedulerRepo.pushRun(entry);
export const getRunLog = () => schedulerRepo.listRuns();
export const getBackgroundLogs = () => schedulerRepo.listLogs();

let instance: Scheduler | null = null;

export const startScheduler = async () => {
  if (instance) return instance;

  log("starting scheduler");

  try {
    instance = scheduler({
      id: "nessi",
      store: createLocalStorageStore("nessi-sync"),
      dispatch: { tickMs: 2000 },
    });
    log("scheduler instance created");

    const cronConfig = await settingsRepo.getCronConfig();

    await instance.register({
      id: "refresh-metadata",
      cron: cronConfig["refresh-metadata"]!,
      job: refreshMetadataJob,
      input: {},
      misfire: "catch_up_one",
    });
    log(`registered refresh-metadata (${cronConfig["refresh-metadata"]})`);

    await instance.register({
      id: "consolidate-memory",
      cron: cronConfig["consolidate-memory"]!,
      job: consolidateMemoryJob,
      input: {},
      misfire: "catch_up_one",
    });
    log(`registered consolidate-memory (${cronConfig["consolidate-memory"]})`);

    await instance.register({
      id: "suggest-topics",
      cron: cronConfig["suggest-topics"]!,
      job: suggestTopicsJob,
      input: {},
      misfire: "catch_up_one",
    });
    log(`registered suggest-topics (${cronConfig["suggest-topics"]})`);

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

/** Manually trigger a job, bypassing schedule and internal guards. */
export const triggerJob = async (jobId: string) => {
  const entry: JobRunLog = { jobId, startedAt: new Date().toISOString(), status: "running" };
  await pushJobLog(entry);
  log(`manual trigger: ${jobId}`);

  try {
    if (jobId === "refresh-metadata") {
      const { runMetadataRefresh } = await import("./jobs/refresh-metadata.js");
      const result = await runMetadataRefresh();
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = result.summary;
    } else if (jobId === "consolidate-memory") {
      const { runConsolidation } = await import("./jobs/consolidate-memory.js");
      const result = await runConsolidation();
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = result.summary ?? result.reason;
    } else if (jobId === "suggest-topics") {
      const { runSuggestTopics } = await import("./jobs/suggest-topics.js");
      const result = await runSuggestTopics();
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = result.summary ?? result.reason;
    }
    await pushJobLog(entry);
    log(`manual trigger done: ${jobId} — ${entry.result}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.finishedAt = new Date().toISOString();
    entry.status = "error";
    entry.error = msg;
    await pushJobLog(entry);
    log(`manual trigger failed: ${jobId} — ${msg}`);
  }
};

export const triggerMetadataRefresh = async () => {
  if (!instance) return;
  try {
    await instance.triggerNow({ id: "refresh-metadata" });
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
  const cron = await settingsRepo.getCronFor(jobId);
  const jobMap: Record<string, Parameters<typeof instance.register>[0]["job"]> = {
    "refresh-metadata": refreshMetadataJob,
    "consolidate-memory": consolidateMemoryJob,
    "suggest-topics": suggestTopicsJob,
  };
  const job = jobMap[jobId];
  if (!job) return;
  try {
    await instance.register({ id: jobId, cron, job, input: {}, misfire: "catch_up_one" });
    log(`reloaded cron for ${jobId}: ${cron}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`reloadCron failed for ${jobId}: ${msg}`);
  }
};

export const getScheduler = () => instance;
