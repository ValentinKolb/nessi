import { createLocalStorageStore, scheduler, type Scheduler } from "@valentinkolb/sync-browser";
import { refreshMetadataJob } from "./jobs/refresh-metadata.js";
import { consolidateMemoryJob, incrementChatsSinceConsolidation } from "./jobs/consolidate-memory.js";
import { readJson, writeJson } from "./json-storage.js";

// ---------------------------------------------------------------------------
// Console logging
// ---------------------------------------------------------------------------

const PREFIX = "[nessi:bg]";
const RUN_LOG_KEY = "nessi:bg:run-log";
const TEXT_LOG_KEY = "nessi:bg:text-log";
const MAX_RUN_LOG_ENTRIES = 20;
const MAX_TEXT_LOG_ENTRIES = 200;

/** Log a background task debug message to console. */
export const log = (msg: string) => {
  console.debug(`${PREFIX} ${msg}`);
  textLog.push(`[${new Date().toISOString()}] ${msg}`);
  if (textLog.length > MAX_TEXT_LOG_ENTRIES) textLog.shift();
  persistTextLog();
};

// ---------------------------------------------------------------------------
// Job run log (in-memory ring buffer for Settings UI)
// ---------------------------------------------------------------------------

export type JobRunLog = {
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
};

const runLog = readJson<JobRunLog[]>(RUN_LOG_KEY, []);
const textLog = readJson<string[]>(TEXT_LOG_KEY, []);

const persistRunLog = () => {
  writeJson(RUN_LOG_KEY, runLog);
};

const persistTextLog = () => {
  writeJson(TEXT_LOG_KEY, textLog);
};

/** Push a new log entry (called from job process functions). */
export const pushJobLog = (entry: JobRunLog) => {
  runLog.push(entry);
  if (runLog.length > MAX_RUN_LOG_ENTRIES) runLog.shift();
  persistRunLog();
};

/** Persist mutations after a run log entry has been updated in place. */
export const syncJobLog = () => {
  persistRunLog();
};

/** Get the full run log for the Settings UI. */
export const getRunLog = (): readonly JobRunLog[] => runLog;

/** Get background text logs for the Settings UI. */
export const getBackgroundLogs = (): readonly string[] => textLog;

/** Get the latest log entry for a specific job. */
export const getLatestRun = (jobId: string): JobRunLog | undefined => {
  for (let i = runLog.length - 1; i >= 0; i--) {
    if (runLog[i]!.jobId === jobId) return runLog[i];
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Scheduler singleton
// ---------------------------------------------------------------------------

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

/** Trigger metadata refresh immediately via scheduler. */
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
