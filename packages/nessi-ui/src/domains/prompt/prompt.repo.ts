import defaultPromptContent from "../../assets/prompts/default-prompt.mustache?raw";
import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { localStorageJson } from "../../shared/storage/local-storage.js";
import { newId } from "../../lib/utils.js";
import type { Prompt } from "./prompt.types.js";

const ACTIVE_KEY = "nessi:activePrompt";
const SEEN_HASH_KEY = "nessi:promptSeenHash";
const DEFAULT_ID = "default";
const DEFAULT_PROMPT: Prompt = { id: DEFAULT_ID, name: "nessi", content: defaultPromptContent };

const toPrompt = (entry: { id: string; name: string; content: string }): Prompt => ({
  id: entry.id,
  name: entry.name,
  content: entry.content,
});

const hashString = (str: string) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
};

const list = async () => {
  await db.init();
  const stored = await db.instance.prompts.orderBy("updatedAt").reverse().toArray();
  const userPrompts = stored.map(toPrompt);
  const defaultOverride = userPrompts.find((prompt) => prompt.id === DEFAULT_ID);
  const others = userPrompts.filter((prompt) => prompt.id !== DEFAULT_ID);
  return [defaultOverride ?? DEFAULT_PROMPT, ...others];
};

const listUser = async () => {
  await db.init();
  const stored = await db.instance.prompts.toArray();
  return stored.map(toPrompt);
};

const saveAllUser = async (prompts: Prompt[]) => {
  await db.init();
  const now = new Date().toISOString();
  await db.instance.prompts.clear();
  if (prompts.length > 0) {
    await db.instance.prompts.bulkPut(prompts.map((prompt) => ({
      ...prompt,
      updatedAt: now,
    })));
  }
  dbEvents.emit({ scope: "prompts" });
};

const saveOne = async (prompt: Prompt) => {
  await db.init();
  await db.instance.prompts.put({
    ...prompt,
    updatedAt: new Date().toISOString(),
  });
  dbEvents.emit({ scope: "prompts", id: prompt.id });
};

const remove = async (id: string) => {
  await db.init();
  await db.instance.prompts.delete(id);
  dbEvents.emit({ scope: "prompts", id });
};

const getActiveId = () => localStorageJson.readString(ACTIVE_KEY, DEFAULT_ID);

const setActiveId = (id: string) => {
  localStorageJson.writeString(ACTIVE_KEY, id);
};

const getActive = async () => {
  const id = getActiveId();
  const all = await list();
  return all.find((prompt) => prompt.id === id) ?? DEFAULT_PROMPT;
};

const newPromptId = () => newId();

const isDefault = (prompt: Prompt) => prompt.id === DEFAULT_ID;

const getDefaultPromptHash = () => hashString(defaultPromptContent);

const acknowledgeVersion = () => {
  localStorageJson.writeString(SEEN_HASH_KEY, getDefaultPromptHash());
};

const hasDefaultOverride = async () => {
  const prompts = await listUser();
  return prompts.some((prompt) => prompt.id === DEFAULT_ID);
};

const hasUpdate = async () => {
  const current = getDefaultPromptHash();
  const seen = localStorageJson.readString(SEEN_HASH_KEY);
  if (!seen) {
    acknowledgeVersion();
    return false;
  }
  return current !== seen;
};

const acceptUpdate = async () => {
  const prompts = await listUser();
  await saveAllUser(prompts.filter((prompt) => prompt.id !== DEFAULT_ID));
  acknowledgeVersion();
};

export const promptRepo = {
  DEFAULT_ID,
  DEFAULT_PROMPT,
  list,
  listUser,
  saveAllUser,
  saveOne,
  remove,
  getActive,
  getActiveId,
  setActiveId,
  newPromptId,
  isDefault,
  hasDefaultOverride,
  getDefaultPromptHash,
  acknowledgeVersion,
  hasUpdate,
  acceptUpdate,
} as const;
