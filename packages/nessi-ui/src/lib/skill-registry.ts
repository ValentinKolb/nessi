import { skillPaths, skillRegistry, type SkillEntry } from "../skills/core/index.js";

export type { SkillEntry } from "../skills/core/index.js";

export const listCachedSkills = () => skillRegistry.snapshot();
export const listSkills = () => skillRegistry.list();
export const saveSkills = (entries: SkillEntry[]) => skillRegistry.saveAll(entries);
export const ensureUniqueSkillId = (base: string, existing: SkillEntry[]) => skillRegistry.ensureUniqueId(base, existing);
export const listEnabledCachedSkills = () => skillRegistry.enabledSnapshot();
export const listEnabledSkills = () => skillRegistry.enabled();
export const skillPath = skillPaths.doc;
