import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import type { SchedulerRun } from "./scheduler.types.js";

const MAX_RUN_LOG_ENTRIES = 20;
const MAX_TEXT_LOG_ENTRIES = 200;

const listRuns = async () => {
  await db.init();
  const runs = await db.instance.schedulerRuns.orderBy("startedAt").reverse().toArray();
  return runs.map(({ id: _id, ...run }) => run) satisfies SchedulerRun[];
};

const listLogs = async () => {
  await db.init();
  const logs = await db.instance.schedulerLogs.orderBy("id").reverse().limit(MAX_TEXT_LOG_ENTRIES).toArray();
  return logs.reverse().map((entry) => entry.message);
};

const pruneRuns = async (jobId: string) => {
  const ids = await db.instance.schedulerRuns
    .where("jobId")
    .equals(jobId)
    .reverse()
    .offset(MAX_RUN_LOG_ENTRIES)
    .primaryKeys();
  if (ids.length > 0) await db.instance.schedulerRuns.bulkDelete(ids);
};

const pruneLogs = async () => {
  const total = await db.instance.schedulerLogs.count();
  const overflow = total - MAX_TEXT_LOG_ENTRIES;
  if (overflow <= 0) return;
  const ids = await db.instance.schedulerLogs.orderBy("id").limit(overflow).primaryKeys();
  if (ids.length > 0) await db.instance.schedulerLogs.bulkDelete(ids);
};

const pushRun = async (run: SchedulerRun) => {
  await db.init();
  await db.instance.schedulerRuns.put({
    id: `${run.jobId}:${run.startedAt}`,
    ...run,
  });
  await pruneRuns(run.jobId);
  dbEvents.emit({ scope: "scheduler", id: run.jobId });
};

const updateRun = async (run: SchedulerRun) => {
  await pushRun(run);
};

const getLatestRun = async (jobId: string) => {
  await db.init();
  const latest = await db.instance.schedulerRuns.where("jobId").equals(jobId).reverse().sortBy("startedAt");
  const run = latest[0];
  if (!run) return undefined;
  const { id: _id, ...rest } = run;
  return rest as SchedulerRun;
};

const pushLog = async (message: string, level: "debug" | "info" | "warn" | "error" = "debug", jobId?: string) => {
  await db.init();
  await db.instance.schedulerLogs.add({
    ts: new Date().toISOString(),
    level,
    message,
    jobId,
  });
  await pruneLogs();
  dbEvents.emit({ scope: "scheduler", id: jobId });
};

export const schedulerRepo = {
  listRuns,
  listLogs,
  pushRun,
  updateRun,
  getLatestRun,
  pushLog,
} as const;
