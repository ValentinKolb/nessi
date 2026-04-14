import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import type { CompactionSettings, ToolApprovalMap } from "./settings.types.js";

const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  autoCompactAfterMessages: 30,
  keepRecentLoops: 8,
  maxToolChars: 300,
  maxSourceChars: 24_000,
};

const normalizeAutoCompactAfterMessages = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.autoCompactAfterMessages;
  return Math.min(80, Math.max(10, Math.round(parsed)));
};

const normalizeKeepRecentLoops = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.keepRecentLoops;
  return Math.min(20, Math.max(2, Math.round(parsed)));
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

const loadCompactionSettings = async () => {
  const raw = await getDoc<Partial<CompactionSettings>>("compaction-settings", DEFAULT_COMPACTION_SETTINGS);
  return {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(raw.autoCompactAfterMessages),
    keepRecentLoops: normalizeKeepRecentLoops(raw.keepRecentLoops),
    maxToolChars: normalizeMaxToolChars(raw.maxToolChars),
    maxSourceChars: normalizeMaxSourceChars(raw.maxSourceChars),
  };
};

const saveCompactionSettings = async (settings: CompactionSettings) => {
  await putDoc("compaction-settings", {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(settings.autoCompactAfterMessages),
    keepRecentLoops: normalizeKeepRecentLoops(settings.keepRecentLoops),
    maxToolChars: normalizeMaxToolChars(settings.maxToolChars),
    maxSourceChars: normalizeMaxSourceChars(settings.maxSourceChars),
  });
};

const loadToolApprovals = async () => getDoc<ToolApprovalMap>("tool-approvals", {});

const setAlwaysAllowed = async (toolName: string) => {
  const current = await loadToolApprovals();
  await putDoc("tool-approvals", { ...current, [toolName]: true });
};

export const settingsRepo = {
  DEFAULT_COMPACTION_SETTINGS,
  getBackgroundPrompt,
  setBackgroundPrompt,
  getConsolidationPrompt,
  setConsolidationPrompt,
  getCompactionPrompt,
  setCompactionPrompt,
  loadCompactionSettings,
  saveCompactionSettings,
  loadToolApprovals,
  setAlwaysAllowed,
} as const;
