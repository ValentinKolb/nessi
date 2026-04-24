import { isValidCron as isValidCronExpr } from "cron-validator";
import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import type { CompactionSettings, ImageAnalysisSettings, ToolApprovalMap } from "./settings.types.js";

const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  maxToolChars: 300,
  maxSourceChars: 24_000,
  maxToolResultChars: 1500,
};

const normalizeMaxToolChars = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.maxToolChars;
  return Math.min(2000, Math.max(100, Math.round(parsed)));
};

const normalizeMaxSourceChars = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.maxSourceChars;
  return Math.min(100_000, Math.max(4_000, Math.round(parsed)));
};

const normalizeMaxToolResultChars = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.maxToolResultChars;
  if (parsed <= 0) return Infinity; // 0 = unlimited
  return Math.min(100_000, Math.max(500, Math.round(parsed)));
};

const getDoc = async <T>(key: string, fallback: T): Promise<T> => {
  await db.init();
  const entry = await db.instance.appDocs.get(key);
  return (entry?.value as T | undefined) ?? fallback;
};

const putDoc = async (key: string, value: unknown) => {
  await db.init();
  await db.instance.appDocs.put({
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
  dbEvents.emit({ scope: "settings", id: key });
};

const getBackgroundPrompt = async () =>
  getDoc("background-prompt:refresh-metadata", null as string | null);

const setBackgroundPrompt = async (prompt: string) => {
  await putDoc("background-prompt:refresh-metadata", prompt);
};

const getConsolidationPrompt = async () =>
  getDoc("background-prompt:consolidate-memory", null as string | null);

const setConsolidationPrompt = async (prompt: string) => {
  await putDoc("background-prompt:consolidate-memory", prompt);
};

const getCompactionPrompt = async () =>
  getDoc("compaction-prompt", null as string | null);

const setCompactionPrompt = async (prompt: string) => {
  await putDoc("compaction-prompt", prompt);
};

const loadCompactionSettings = async (): Promise<CompactionSettings> => {
  const raw = await getDoc<Partial<CompactionSettings>>("compaction-settings", DEFAULT_COMPACTION_SETTINGS);
  return {
    maxToolChars: normalizeMaxToolChars(raw.maxToolChars),
    maxSourceChars: normalizeMaxSourceChars(raw.maxSourceChars),
    maxToolResultChars: normalizeMaxToolResultChars(raw.maxToolResultChars),
  };
};

const saveCompactionSettings = async (settings: CompactionSettings) => {
  await putDoc("compaction-settings", {
    maxToolChars: normalizeMaxToolChars(settings.maxToolChars),
    maxSourceChars: normalizeMaxSourceChars(settings.maxSourceChars),
    maxToolResultChars: normalizeMaxToolResultChars(settings.maxToolResultChars),
  });
};

const getSuggestionPrompt = async () =>
  getDoc("background-prompt:suggest-topics", null as string | null);

const setSuggestionPrompt = async (prompt: string) => {
  await putDoc("background-prompt:suggest-topics", prompt);
};

const getHapticsEnabled = async () =>
  getDoc("haptics-enabled", true);

const setHapticsEnabled = async (enabled: boolean) => {
  await putDoc("haptics-enabled", enabled);
};

const loadToolApprovals = async () => getDoc<ToolApprovalMap>("tool-approvals", {});

const setAlwaysAllowed = async (toolName: string) => {
  const current = await loadToolApprovals();
  await putDoc("tool-approvals", { ...current, [toolName]: true });
};

const DEFAULT_IMAGE_ANALYSIS_SETTINGS: ImageAnalysisSettings = { providerId: null };

const getImageAnalysisSettings = async () =>
  getDoc<ImageAnalysisSettings>("image-analysis-settings", DEFAULT_IMAGE_ANALYSIS_SETTINGS);

const setImageAnalysisSettings = async (settings: ImageAnalysisSettings) => {
  await putDoc("image-analysis-settings", settings);
};

const getImageAnalysisPrompt = async () =>
  getDoc("image-analysis-prompt", null as string | null);

const setImageAnalysisPrompt = async (prompt: string) => {
  await putDoc("image-analysis-prompt", prompt);
};

export const DEFAULT_CRON_CONFIG = {
  "refresh-metadata": "*/2 * * * *",
  "consolidate-memory": "0 */2 * * *",
  "suggest-topics": "*/30 * * * *",
} as const satisfies Record<string, string>;

type CronConfig = Record<string, string>;

const isValidCron = (cron: unknown): cron is string =>
  typeof cron === "string" && isValidCronExpr(cron.trim(), { alias: true, allowSevenAsSunday: true });

const getCronConfig = async (): Promise<CronConfig> => {
  const stored = await getDoc<CronConfig>("scheduler-crons", {});
  const merged: CronConfig = { ...DEFAULT_CRON_CONFIG };
  for (const [id, cron] of Object.entries(stored)) {
    if (isValidCron(cron)) merged[id] = cron;
  }
  return merged;
};

const getCronFor = async (jobId: keyof typeof DEFAULT_CRON_CONFIG | string): Promise<string> => {
  const config = await getCronConfig();
  return config[jobId] ?? (DEFAULT_CRON_CONFIG as Record<string, string>)[jobId] ?? "* * * * *";
};

const setCronFor = async (jobId: string, cron: string): Promise<void> => {
  const current = await getDoc<CronConfig>("scheduler-crons", {});
  const next: CronConfig = { ...current };
  if (isValidCron(cron)) next[jobId] = cron.trim();
  else delete next[jobId];
  await putDoc("scheduler-crons", next);
};

export const settingsRepo = {
  DEFAULT_COMPACTION_SETTINGS,
  DEFAULT_IMAGE_ANALYSIS_SETTINGS,
  getBackgroundPrompt,
  setBackgroundPrompt,
  getConsolidationPrompt,
  setConsolidationPrompt,
  getCompactionPrompt,
  setCompactionPrompt,
  getSuggestionPrompt,
  setSuggestionPrompt,
  getHapticsEnabled,
  setHapticsEnabled,
  loadCompactionSettings,
  saveCompactionSettings,
  loadToolApprovals,
  setAlwaysAllowed,
  getImageAnalysisSettings,
  setImageAnalysisSettings,
  getImageAnalysisPrompt,
  setImageAnalysisPrompt,
  getCronConfig,
  getCronFor,
  setCronFor,
  isValidCron,
} as const;
