import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import type { CompactionSettings, ToolApprovalMap } from "./settings.types.js";

const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  autoCompactAfterMessages: 30,
};

const normalizeAutoCompactAfterMessages = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPACTION_SETTINGS.autoCompactAfterMessages;
  return Math.min(50, Math.max(20, Math.round(parsed)));
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

const loadCompactionSettings = async () => {
  const raw = await getDoc<Partial<CompactionSettings>>("compaction-settings", DEFAULT_COMPACTION_SETTINGS);
  return {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(raw.autoCompactAfterMessages),
  };
};

const saveCompactionSettings = async (settings: CompactionSettings) => {
  await putDoc("compaction-settings", {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(settings.autoCompactAfterMessages),
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
  loadCompactionSettings,
  saveCompactionSettings,
  loadToolApprovals,
  setAlwaysAllowed,
} as const;
