import { settingsRepo, type CompactionSettings } from "../domains/settings/index.js";

export type { CompactionSettings } from "../domains/settings/index.js";

export const loadCompactionSettings = () => settingsRepo.loadCompactionSettings();
export const saveCompactionSettings = (settings: CompactionSettings) => settingsRepo.saveCompactionSettings(settings);
