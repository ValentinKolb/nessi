import { readJson, writeJson } from "./json-storage.js";

const STORAGE_KEY = "nessi:compaction-settings:v1";

export type CompactionSettings = {
  autoCompactAfterMessages: number;
};

const DEFAULT_SETTINGS: CompactionSettings = {
  autoCompactAfterMessages: 30,
};

const normalizeAutoCompactAfterMessages = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.autoCompactAfterMessages;
  return Math.min(50, Math.max(20, Math.round(parsed)));
};

export const loadCompactionSettings = () => {
  const raw = readJson<Partial<CompactionSettings>>(STORAGE_KEY, DEFAULT_SETTINGS);
  return {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(raw.autoCompactAfterMessages),
  };
};

export const saveCompactionSettings = (settings: CompactionSettings) => {
  writeJson(STORAGE_KEY, {
    autoCompactAfterMessages: normalizeAutoCompactAfterMessages(settings.autoCompactAfterMessages),
  });
};
