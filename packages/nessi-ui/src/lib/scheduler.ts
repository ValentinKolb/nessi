import { createLocalStorageStore, scheduler, type Scheduler } from "@valentinkolb/sync-browser";
import { refreshMetadataJob } from "./jobs/refresh-metadata.js";
import { consolidateMemoryJob, incrementChatsSinceConsolidation } from "./jobs/consolidate-memory.js";
import { suggestTopicsJob } from "./jobs/suggest-topics.js";
import { schedulerRepo, type SchedulerRun } from "../domains/scheduler/index.js";

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

    await instance.register({
      id: "refresh-metadata",
      cron: "* * * * *",
      job: refreshMetadataJob,
      input: {},
      misfire: "catch_up_one",
    });
    log("registered refresh-metadata (every minute)");

    await instance.register({
      id: "consolidate-memory",
      cron: "0 */2 * * *",
      job: consolidateMemoryJob,
      input: {},
      misfire: "catch_up_one",
    });
    log("registered consolidate-memory (every 2h)");

    await instance.register({
      id: "suggest-topics",
      cron: "*/30 * * * *",
      job: suggestTopicsJob,
      input: {},
      misfire: "catch_up_one",
    });
    log("registered suggest-topics (every 30min)");

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

export const getScheduler = () => instance;
