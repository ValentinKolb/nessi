import Dexie, { type Table } from "dexie";
import type { Message } from "nessi-core";

export type DbPrompt = {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
};

export type DbSkill = {
  id: string;
  name: string;
  description: string;
  command: string;
  enabled: boolean;
  doc: string;
  code?: string;
  references?: Array<{ name: string; content: string }>;
  builtin?: boolean;
  updatedAt: string;
};

export type DbMemoryEntry = {
  id: string;
  order: number;
  text: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type DbChat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  titleSource?: "fallback" | "generated";
  description?: string;
  topics?: string[];
  lastIndexedAt?: string;
  lastIndexedEntryCount?: number;
};

export type DbChatEntry = {
  id: string;
  chatId: string;
  seq: number;
  kind: "message" | "summary";
  message: Message;
  createdAt?: string;
};

export type DbChatFileMeta = {
  id: string;
  chatId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "input" | "output";
  sourceType: "text" | "pdf" | "table" | "image" | "generated";
  mountPath: string;
  createdAt: string;
  updatedAt?: string;
};

export type DbMessageFileRef = {
  id: string;
  chatId: string;
  messageSeq: number;
  fileIds: string[];
};

export type DbSchedulerRun = {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
};

export type DbSchedulerLog = {
  id?: number;
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  jobId?: string;
};

export type DbAppDoc = {
  key: string;
  value: unknown;
  updatedAt: string;
};

class NessiDb extends Dexie {
  prompts!: Table<DbPrompt, string>;
  skills!: Table<DbSkill, string>;
  memoryEntries!: Table<DbMemoryEntry, string>;
  chats!: Table<DbChat, string>;
  chatEntries!: Table<DbChatEntry, string>;
  chatFilesMeta!: Table<DbChatFileMeta, string>;
  messageFileRefs!: Table<DbMessageFileRef, string>;
  schedulerRuns!: Table<DbSchedulerRun, string>;
  schedulerLogs!: Table<DbSchedulerLog, number>;
  appDocs!: Table<DbAppDoc, string>;

  constructor() {
    super("nessi-app");

    this.version(1).stores({
      prompts: "&id,name,updatedAt",
      skills: "&id,command,builtin,enabled,updatedAt",
      memoryEntries: "&id,order,category,updatedAt",
      chats: "&id,createdAt,updatedAt,titleSource,lastIndexedAt",
      chatEntries: "&id,chatId,[chatId+seq],createdAt,kind",
      chatFilesMeta: "&id,chatId,kind,mountPath,createdAt",
      messageFileRefs: "&id,chatId,[chatId+messageSeq]",
      schedulerRuns: "&id,jobId,startedAt,status",
      schedulerLogs: "++id,ts,jobId,level",
      appDocs: "&key,updatedAt",
    });
  }
}

export const appDb = new NessiDb();

let initPromise: Promise<void> | null = null;

const init = async () => {
  await appDb.open();
};

export const db = {
  instance: appDb,
  init: async () => {
    if (!initPromise) initPromise = init();
    await initPromise;
  },
} as const;
