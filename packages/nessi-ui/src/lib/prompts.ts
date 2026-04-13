import defaultPromptContent from "../assets/prompts/default-prompt.mustache?raw";
import { getActiveProviderEntry } from "./provider.js";
import { getSkillsSummary } from "./skills.js";
import { formatForPrompt } from "./memory.js";
import { readJson, readString, removeKey, writeJson, writeString } from "./json-storage.js";
import { newId } from "./utils.js";

export type Prompt = {
  id: string;
  name: string;
  content: string;
};

export type PromptContext = {
  fileInfo?: string;
};

const PROMPTS_KEY = "nessi:prompts";
const ACTIVE_KEY = "nessi:activePrompt";
const DEFAULT_ID = "default";

const DEFAULT_PROMPT: Prompt = { id: DEFAULT_ID, name: "nessi", content: defaultPromptContent };

export const loadUserPrompts = () => readJson<Prompt[]>(PROMPTS_KEY, []);

export const saveUserPrompts = (prompts: Prompt[]) => {
  writeJson(PROMPTS_KEY, prompts);
};

/** All prompts: default first, then user-created. */
export const loadPrompts = () => {
  const userPrompts = loadUserPrompts();
  const defaultOverride = userPrompts.find((prompt) => prompt.id === DEFAULT_ID);
  const others = userPrompts.filter((prompt) => prompt.id !== DEFAULT_ID);
  return [defaultOverride ?? DEFAULT_PROMPT, ...others];
};

export const getActivePromptId = () => readString(ACTIVE_KEY, DEFAULT_ID);

export const setActivePromptId = (id: string) => {
  writeString(ACTIVE_KEY, id);
};

export const getActivePrompt = () => {
  const id = getActivePromptId();
  const all = loadPrompts();
  return all.find((p) => p.id === id) ?? DEFAULT_PROMPT;
};

/** Fill runtime placeholders like {{date}}, {{weekday}}, {{model}}, {{skills}}, {{file_info}}. */
export const resolvePrompt = (prompt: Prompt, context?: PromptContext) => {
  const now = new Date();
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = WEEKDAYS[now.getDay()] ?? "Monday";
  const provider = getActiveProviderEntry();
  return prompt.content
    .replaceAll("{{date}}", now.toISOString().slice(0, 10))
    .replaceAll("{{weekday}}", weekday)
    .replaceAll("{{model}}", provider?.model ?? "unknown")
    .replaceAll("{{skills}}", getSkillsSummary())
    .replaceAll("{{input_files}}", context?.fileInfo ?? "")
    .replaceAll("{{memories}}", formatForPrompt());
};

export const newPromptId = () => newId();

export const isDefault = (p: Prompt) => p.id === DEFAULT_ID;

// ---------------------------------------------------------------------------
// Prompt version tracking
// ---------------------------------------------------------------------------

const SEEN_HASH_KEY = "nessi:promptSeenHash";

/** Simple djb2 hash — not cryptographic, just change detection. */
const hashString = (str: string) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
};

/** Hash of the currently shipped default prompt. */
export const getDefaultPromptHash = () => hashString(defaultPromptContent);

/** Hash the user last acknowledged. */
const getSeenHash = () => readString(SEEN_HASH_KEY);

/** Mark the current shipped version as seen. */
export const acknowledgePromptVersion = () =>
  writeString(SEEN_HASH_KEY, getDefaultPromptHash());

/** True if the user has a custom override of the default prompt. */
export const hasDefaultOverride = () =>
  loadUserPrompts().some((p) => p.id === DEFAULT_ID);

/** True if there's a new default prompt the user hasn't seen yet. */
export const hasPromptUpdate = () => {
  const current = getDefaultPromptHash();
  const seen = getSeenHash();
  // No seen hash stored yet → first run or pre-feature → don't nag, just record
  if (!seen) {
    acknowledgePromptVersion();
    return false;
  }
  return current !== seen;
};

/** Accept the update: remove custom override (if any) and acknowledge. */
export const acceptPromptUpdate = () => {
  if (hasDefaultOverride()) {
    saveUserPrompts(loadUserPrompts().filter((p) => p.id !== DEFAULT_ID));
  }
  acknowledgePromptVersion();
};
