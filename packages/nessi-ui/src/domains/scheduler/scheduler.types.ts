export type SchedulerRun = {
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
};
