import compactionPromptContent from "../assets/prompts/compaction-prompt.mustache?raw";
import { settingsRepo, type CompactionSettings } from "../domains/settings/index.js";

export type { CompactionSettings } from "../domains/settings/index.js";

export const loadCompactionSettings = () => settingsRepo.loadCompactionSettings();
export const saveCompactionSettings = (settings: CompactionSettings) => settingsRepo.saveCompactionSettings(settings);

export const getCompactionPrompt = async () =>
  await settingsRepo.getCompactionPrompt() ?? compactionPromptContent;

export const setCompactionPrompt = async (prompt: string) =>
  settingsRepo.setCompactionPrompt(prompt);

export const resetCompactionPrompt = async () => {
  await settingsRepo.setCompactionPrompt(compactionPromptContent);
  return compactionPromptContent;
};

export const getDefaultCompactionPrompt = () => compactionPromptContent;
