import { humanId } from "human-id";
import type { Message } from "nessi-core";
import { db } from "./db.js";
import { localStorageJson } from "../storage/local-storage.js";

const CHAT_PREFIX = "chat:";
const CHAT_INDEX_KEY = "nessi:chat-index";
const CHAT_FILES_KEY = "nessi:chat-files:v1";
const MESSAGE_FILE_REFS_PREFIX = "nessi:chat-file-refs:";
const RUN_LOG_KEY = "nessi:bg:run-log";
const TEXT_LOG_KEY = "nessi:bg:text-log";
const PROMPTS_KEY = "nessi:prompts";
const SKILLS_KEY = "nessi:skills:v2";
const MEMORY_KEY = "nessi:memory";
const BG_PROMPT_KEY = "nessi:bg-prompt:refresh-metadata";
const BG_CONSOLIDATION_KEY = "nessi:bg-prompt:consolidate-memory";
const COMPACTION_KEY = "nessi:compaction-settings:v1";
const TOOL_APPROVALS_KEY = "nessi:tool-approvals";
const MIGRATION_KEY = "migration-version";

const newId = () => humanId({ separator: "-", capitalize: false });

const readJson = <T>(key: string, fallback: T) => localStorageJson.read(key, fallback);

const nowIso = () => new Date().toISOString();

const readChatIds = () => {
  const indexed = readJson<string[]>(CHAT_INDEX_KEY, []);
  if (indexed.length > 0) return indexed;

  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((key): key is string => key != null && key.startsWith(CHAT_PREFIX) && key.endsWith(":meta"))
    .map((key) => key.slice(CHAT_PREFIX.length, -":meta".length))
    .filter(Boolean);
};

const readChatMeta = (chatId: string) =>
  readJson<Record<string, unknown> | null>(`${CHAT_PREFIX}${chatId}:meta`, null);

const readChatEntries = (chatId: string) =>
  readJson<Array<{ seq: number; kind?: "message" | "summary"; message: Message; createdAt?: string }>>(`${CHAT_PREFIX}${chatId}:entries`, []);

const categoryOf = (line: string) => {
  const match = line.match(/^\[(\w+)/);
  return match?.[1]?.toLowerCase() ?? "fact";
};

const importAppDoc = async (key: string, value: unknown) => {
  if (value === undefined || value === null || value === "") return;
  await db.instance.appDocs.put({ key, value, updatedAt: nowIso() });
};

export const dbMigrate = {
  async run() {
    await db.init();
    const existing = await db.instance.appDocs.get(MIGRATION_KEY);
    if (existing) return;

    const migratedAt = nowIso();

    await db.instance.transaction(
      "rw",
      [
        db.instance.prompts,
        db.instance.skills,
        db.instance.memoryEntries,
        db.instance.chats,
        db.instance.chatEntries,
        db.instance.chatFilesMeta,
        db.instance.messageFileRefs,
        db.instance.schedulerRuns,
        db.instance.schedulerLogs,
        db.instance.appDocs,
      ],
      async () => {
        const prompts = readJson<Array<{ id: string; name: string; content: string }>>(PROMPTS_KEY, []);
        if (prompts.length > 0) {
          await db.instance.prompts.bulkPut(prompts.map((prompt) => ({
            ...prompt,
            updatedAt: migratedAt,
          })));
        }

        const skills = readJson<Array<{
          id: string;
          name: string;
          description: string;
          command: string;
          enabled: boolean;
          doc: string;
          code?: string;
          builtin?: boolean;
        }>>(SKILLS_KEY, []);
        if (skills.length > 0) {
          await db.instance.skills.bulkPut(skills.map((skill) => ({
            ...skill,
            updatedAt: migratedAt,
          })));
        }

        const memory = localStorageJson.readString(MEMORY_KEY).trim();
        if (memory) {
          const lines = memory.split("\n").map((line) => line.trim()).filter(Boolean);
          await db.instance.memoryEntries.bulkPut(lines.map((text, index) => ({
            id: newId(),
            order: (index + 1) * 100,
            text,
            category: categoryOf(text),
            createdAt: migratedAt,
            updatedAt: migratedAt,
          })));
        }

        const chatIds = readChatIds();
        if (chatIds.length > 0) {
        const chats = chatIds
            .map((chatId) => {
              const meta = readChatMeta(chatId);
              if (!meta || typeof meta.id !== "string" || typeof meta.title !== "string" || typeof meta.createdAt !== "string") return null;
              const lastIndexedAt = typeof meta.lastIndexedAt === "string" ? meta.lastIndexedAt : undefined;
              const updatedAt = lastIndexedAt ?? meta.createdAt;
              const titleSource: "fallback" | "generated" = meta.titleSource === "generated" ? "generated" : "fallback";

              return {
                id: meta.id,
                title: meta.title,
                createdAt: meta.createdAt,
                updatedAt,
                titleSource,
                description: typeof meta.description === "string" ? meta.description : undefined,
                topics: Array.isArray(meta.topics) ? meta.topics.filter((topic): topic is string => typeof topic === "string") : undefined,
                lastIndexedAt,
                lastIndexedEntryCount: typeof meta.lastIndexedEntryCount === "number" ? meta.lastIndexedEntryCount : undefined,
              };
            })
            .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat));

          if (chats.length > 0) await db.instance.chats.bulkPut(chats);

          const entries = chatIds.flatMap((chatId) =>
            readChatEntries(chatId).map((entry) => ({
              id: `${chatId}:${entry.seq}:${entry.kind ?? "message"}`,
              chatId,
              seq: entry.seq,
              kind: entry.kind ?? "message",
              message: entry.message,
              createdAt: entry.createdAt,
            })),
          );

          if (entries.length > 0) await db.instance.chatEntries.bulkPut(entries);
        }

        const chatFilesMeta = readJson<Array<{
          id: string;
          chatId: string;
          name: string;
          mimeType: string;
          size: number;
          kind: "input" | "output";
          sourceType: "text" | "pdf" | "table" | "generated";
          mountPath: string;
          createdAt: string;
        }>>(CHAT_FILES_KEY, []);
        if (chatFilesMeta.length > 0) {
          await db.instance.chatFilesMeta.bulkPut(chatFilesMeta.map((meta) => ({
            ...meta,
            updatedAt: migratedAt,
          })));
        }

        const refKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
          .filter((key): key is string => key != null && key.startsWith(MESSAGE_FILE_REFS_PREFIX));
        const refs = refKeys.flatMap((key) => {
          const chatId = key.slice(MESSAGE_FILE_REFS_PREFIX.length);
          const value = readJson<Record<string, string[]>>(key, {});
          return Object.entries(value).map(([messageSeq, fileIds]) => ({
            id: `${chatId}:${messageSeq}`,
            chatId,
            messageSeq: Number(messageSeq),
            fileIds: Array.isArray(fileIds) ? fileIds.filter((fileId): fileId is string => typeof fileId === "string") : [],
          }));
        });
        if (refs.length > 0) await db.instance.messageFileRefs.bulkPut(refs);

        const runs = readJson<Array<{
          jobId: string;
          startedAt: string;
          finishedAt?: string;
          status: "running" | "success" | "error";
          result?: string;
          error?: string;
        }>>(RUN_LOG_KEY, []);
        if (runs.length > 0) {
          await db.instance.schedulerRuns.bulkPut(runs.map((run) => ({
            ...run,
            id: `${run.jobId}:${run.startedAt}`,
          })));
        }

        const logs = readJson<string[]>(TEXT_LOG_KEY, []);
        if (logs.length > 0) {
          await db.instance.schedulerLogs.bulkPut(logs.map((message, index) => ({
            id: index + 1,
            ts: migratedAt,
            level: "debug",
            message,
          })));
        }

        await importAppDoc("background-prompt:refresh-metadata", localStorageJson.readString(BG_PROMPT_KEY));
        await importAppDoc("background-prompt:consolidate-memory", localStorageJson.readString(BG_CONSOLIDATION_KEY));
        await importAppDoc("compaction-settings", readJson(COMPACTION_KEY, null));
        await importAppDoc("tool-approvals", readJson(TOOL_APPROVALS_KEY, null));
        await importAppDoc(MIGRATION_KEY, 1);
      },
    );
  },
} as const;
