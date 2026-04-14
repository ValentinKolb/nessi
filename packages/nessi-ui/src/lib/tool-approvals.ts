import { settingsRepo } from "../domains/settings/index.js";

export const isAlwaysAllowed = async (toolName: string) => (await settingsRepo.loadToolApprovals())[toolName] === true;
export const setAlwaysAllowed = (toolName: string) => settingsRepo.setAlwaysAllowed(toolName);
