import { skillDoc } from "../skills/core/skill-doc.js";

export type SkillDocMeta = ReturnType<typeof skillDoc.readMeta> extends infer T ? Exclude<T, null> : never;
export const slugifySkillCommand = skillDoc.slugifyCommand;
export const createSkillDocTemplate = skillDoc.createTemplate;
export const readSkillDocMeta = skillDoc.readMeta;
export const syncSkillDoc = skillDoc.syncDoc;
