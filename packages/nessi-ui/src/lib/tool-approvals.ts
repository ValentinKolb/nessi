import { readJson, writeJson } from "./json-storage.js";

const STORAGE_KEY = "nessi:tool-approvals";

function load(): Record<string, boolean> {
  return readJson<Record<string, boolean>>(STORAGE_KEY, {});
}

/** Check whether a tool was permanently approved by the user. */
export function isAlwaysAllowed(toolName: string): boolean {
  return load()[toolName] === true;
}

/** Mark a tool as permanently approved by the user. */
export function setAlwaysAllowed(toolName: string): void {
  const data = load();
  data[toolName] = true;
  writeJson(STORAGE_KEY, data);
}
