import { memoryFormat } from "./memory.format.js";
import { memoryRepo } from "./memory.repo.js";

const readText = async () => memoryRepo.text();

const writeText = async (text: string) => {
  await memoryRepo.replaceAllFromText(text);
};

const lines = async () => {
  const entries = await memoryRepo.list();
  return entries.map((entry) => entry.text);
};

const formatAll = async () => {
  const entries = await memoryRepo.list();
  return memoryFormat.formatAll(entries);
};

const formatForPrompt = async () => {
  const entries = await memoryRepo.list();
  return memoryFormat.formatForPrompt(entries);
};

const topicSuggestions = async () => {
  const entries = await memoryRepo.list();
  return memoryFormat.topicSuggestions(entries);
};

export const memoryService = {
  readText,
  writeText,
  lines,
  add: memoryRepo.add,
  remove: memoryRepo.remove,
  replace: memoryRepo.replace,
  formatAll,
  formatForPrompt,
  topicSuggestions,
} as const;
