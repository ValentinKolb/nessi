export type { SchedulerRun } from "./scheduler.types.js";
export { schedulerRepo } from "./scheduler.repo.js";

export {
  startScheduler,
  stopScheduler,
  triggerJob,
  triggerMetadataRefresh,
  notifyChatProcessed,
  getScheduler,
  getRunLog,
  getBackgroundLogs,
  log,
  pushJobLog,
  type JobRunLog,
} from "./scheduler.js";

export {
  getBackgroundPrompt,
  setBackgroundPrompt,
  resetBackgroundPrompt,
  getDefaultBackgroundPrompt,
  getConsolidationPrompt,
  setConsolidationPrompt,
  resetConsolidationPrompt,
  getDefaultConsolidationPrompt,
  getSuggestionPrompt,
  setSuggestionPrompt,
  resetSuggestionPrompt,
  getDefaultSuggestionPrompt,
} from "./jobs/background-prompt.js";

export { getSuggestions } from "./jobs/suggest-topics.js";

export type { BackgroundOutput, MemoryOp } from "./jobs/parse-background-output.js";
export { parseBackgroundOutput, applyMemoryOps } from "./jobs/parse-background-output.js";
