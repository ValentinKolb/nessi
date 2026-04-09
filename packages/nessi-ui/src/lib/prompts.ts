import defaultPromptContent from "../assets/prompts/default-prompt.mustache?raw";
import { getActiveProviderEntry } from "./provider.js";
import { getSkillsSummary } from "./skills.js";
import { readJson, readString, writeJson, writeString } from "./json-storage.js";
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
    .replaceAll("{{file_info}}", context?.fileInfo ?? "No chat files are currently mounted.");
};

export const newPromptId = () => newId();

export const isDefault = (p: Prompt) => p.id === DEFAULT_ID;
