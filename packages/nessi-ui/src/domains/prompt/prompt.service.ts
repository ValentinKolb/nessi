import { getActiveProviderEntry } from "../../lib/provider.js";
import { skillRuntime } from "../../skills/core/skill-runtime.js";
import { memoryService } from "../memory/index.js";
import type { Prompt, PromptContext } from "./prompt.types.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const resolve = async (prompt: Prompt, context?: PromptContext) => {
  const now = new Date();
  const weekday = WEEKDAYS[now.getDay()] ?? "Monday";
  const provider = getActiveProviderEntry();
  const skills = await skillRuntime.getSkillsSummary();
  const memories = await memoryService.formatForPrompt();

  return prompt.content
    .replaceAll("{{date}}", now.toISOString().slice(0, 10))
    .replaceAll("{{weekday}}", weekday)
    .replaceAll("{{model}}", provider?.model ?? "unknown")
    .replaceAll("{{skills}}", skills)
    .replaceAll("{{input_files}}", context?.fileInfo ?? "")
    .replaceAll("{{memories}}", memories);
};

export const promptService = {
  resolve,
} as const;
