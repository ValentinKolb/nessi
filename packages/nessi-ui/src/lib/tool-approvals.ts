import { readJson, writeJson } from "./json-storage.js";

const STORAGE_KEY = "nessi:tool-approvals";

const load = () => readJson<Record<string, boolean>>(STORAGE_KEY, {});

/** Check whether a tool was permanently approved by the user. */
export const isAlwaysAllowed = (toolName: string) => load()[toolName] === true;

/** Mark a tool as permanently approved by the user. */
export const setAlwaysAllowed = (toolName: string) => {
  const data = load();
  data[toolName] = true;
  writeJson(STORAGE_KEY, data);
};
