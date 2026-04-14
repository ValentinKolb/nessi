import { createLocalStorageStore, scheduler, type Scheduler } from "@valentinkolb/sync-browser";
import { refreshMetadataJob } from "./jobs/refresh-metadata.js";
import { consolidateMemoryJob, incrementChatsSinceConsolidation } from "./jobs/consolidate-memory.js";
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
      cron: "0 */6 * * *",
      job: consolidateMemoryJob,
      input: {},
      misfire: "skip",
    });
    log("registered consolidate-memory (every 6h)");

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
