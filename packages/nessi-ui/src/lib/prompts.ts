import { humanId } from "human-id";
import defaultPromptContent from "../assets/prompts/default-prompt.mustache?raw";
import { getActiveProviderEntry } from "./provider.js";
import { getSkillsSummary } from "./skills.js";
import { readJson, readString, writeJson, writeString } from "./json-storage.js";

export type Prompt = {
  id: string;
  name: string;
  content: string;
};

const PROMPTS_KEY = "nessi:prompts";
const ACTIVE_KEY = "nessi:activePrompt";
const DEFAULT_ID = "default";

const DEFAULT_PROMPT: Prompt = { id: DEFAULT_ID, name: "nessi", content: defaultPromptContent };

export function loadUserPrompts(): Prompt[] {
  return readJson<Prompt[]>(PROMPTS_KEY, []);
}

export function saveUserPrompts(prompts: Prompt[]) {
  writeJson(PROMPTS_KEY, prompts);
}

/** All prompts: default first, then user-created. */
export function loadPrompts(): Prompt[] {
  const userPrompts = loadUserPrompts();
  const defaultOverride = userPrompts.find((prompt) => prompt.id === DEFAULT_ID);
  const others = userPrompts.filter((prompt) => prompt.id !== DEFAULT_ID);
  return [defaultOverride ?? DEFAULT_PROMPT, ...others];
}

export function getActivePromptId(): string {
  return readString(ACTIVE_KEY, DEFAULT_ID);
}

export function setActivePromptId(id: string) {
  writeString(ACTIVE_KEY, id);
}

export function getActivePrompt(): Prompt {
  const id = getActivePromptId();
  const all = loadPrompts();
  return all.find((p) => p.id === id) ?? DEFAULT_PROMPT;
}

/** Fill {{date}}, {{weekday}}, {{model}}, {{skills}} placeholders. */
export function resolvePrompt(prompt: Prompt): string {
  const now = new Date();
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = WEEKDAYS[now.getDay()] ?? "Monday";
  const provider = getActiveProviderEntry();
  return prompt.content
    .replaceAll("{{date}}", now.toISOString().slice(0, 10))
    .replaceAll("{{weekday}}", weekday)
    .replaceAll("{{model}}", provider?.model ?? "unknown")
    .replaceAll("{{skills}}", getSkillsSummary());
}

export function newPromptId(): string {
  return humanId({ separator: "-", capitalize: false });
}

export function isDefault(p: Prompt): boolean {
  return p.id === DEFAULT_ID;
}
