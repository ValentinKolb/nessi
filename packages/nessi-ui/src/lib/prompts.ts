import { promptRepo, promptService, type Prompt, type PromptContext } from "../domains/prompt/index.js";

export type { Prompt, PromptContext } from "../domains/prompt/index.js";

export const loadUserPrompts = () => promptRepo.listUser();
export const saveUserPrompts = (prompts: Prompt[]) => promptRepo.saveAllUser(prompts);
export const loadPrompts = () => promptRepo.list();
export const getActivePromptId = () => promptRepo.getActiveId();
export const setActivePromptId = (id: string) => promptRepo.setActiveId(id);
export const getActivePrompt = () => promptRepo.getActive();
export const resolvePrompt = (prompt: Prompt, context?: PromptContext) => promptService.resolve(prompt, context);
export const newPromptId = () => promptRepo.newPromptId();
export const isDefault = (prompt: Prompt) => promptRepo.isDefault(prompt);
export const getDefaultPromptHash = () => promptRepo.getDefaultPromptHash();
export const acknowledgePromptVersion = () => promptRepo.acknowledgeVersion();
export const hasDefaultOverride = () => promptRepo.hasDefaultOverride();
export const hasPromptUpdate = () => promptRepo.hasUpdate();
export const acceptPromptUpdate = () => promptRepo.acceptUpdate();
