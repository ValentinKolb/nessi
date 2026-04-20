import backgroundPromptContent from "../../../assets/prompts/background-prompt.mustache?raw";
import consolidationPromptContent from "../../../assets/prompts/consolidation-prompt.mustache?raw";
import suggestionPromptContent from "../../../assets/prompts/suggestion-prompt.mustache?raw";
import { settingsRepo } from "../../settings/index.js";

export const getBackgroundPrompt = async () =>
  await settingsRepo.getBackgroundPrompt() ?? backgroundPromptContent;

export const setBackgroundPrompt = async (prompt: string) =>
  settingsRepo.setBackgroundPrompt(prompt);

export const resetBackgroundPrompt = async () => {
  await settingsRepo.setBackgroundPrompt(backgroundPromptContent);
  return backgroundPromptContent;
};

export const getDefaultBackgroundPrompt = () => backgroundPromptContent;

export const getConsolidationPrompt = async () =>
  await settingsRepo.getConsolidationPrompt() ?? consolidationPromptContent;

export const setConsolidationPrompt = async (prompt: string) =>
  settingsRepo.setConsolidationPrompt(prompt);

export const resetConsolidationPrompt = async () => {
  await settingsRepo.setConsolidationPrompt(consolidationPromptContent);
  return consolidationPromptContent;
};

export const getDefaultConsolidationPrompt = () => consolidationPromptContent;

export const getSuggestionPrompt = async () =>
  await settingsRepo.getSuggestionPrompt() ?? suggestionPromptContent;

export const setSuggestionPrompt = async (prompt: string) =>
  settingsRepo.setSuggestionPrompt(prompt);

export const resetSuggestionPrompt = async () => {
  await settingsRepo.setSuggestionPrompt(suggestionPromptContent);
  return suggestionPromptContent;
};

export const getDefaultSuggestionPrompt = () => suggestionPromptContent;
