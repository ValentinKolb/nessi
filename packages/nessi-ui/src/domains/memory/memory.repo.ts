import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { newId } from "../../lib/utils.js";
import { memoryFormat } from "./memory.format.js";
import type { MemoryEntry } from "./memory.types.js";

const list = async () => {
  await db.init();
  const entries = await db.instance.memoryEntries.orderBy("order").toArray();
  return entries.map((entry) => ({ ...entry })) satisfies MemoryEntry[];
};

const replaceAllFromText = async (text: string) => {
  await db.init();
  const now = new Date().toISOString();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  await db.instance.transaction("rw", db.instance.memoryEntries, async () => {
    await db.instance.memoryEntries.clear();
    if (lines.length > 0) {
      await db.instance.memoryEntries.bulkPut(lines.map((line, index) => ({
        id: newId(),
        order: (index + 1) * 100,
        text: line,
        category: memoryFormat.categoryOfText(line),
        createdAt: now,
        updatedAt: now,
      })));
    }
  });

  dbEvents.emit({ scope: "memory" });
};

const text = async () => {
  const entries = await list();
  return entries.map((entry) => entry.text).join("\n");
};

const add = async (textValue: string) => {
  const entries = await list();
  const now = new Date().toISOString();
  const lastOrder = entries[entries.length - 1]?.order ?? 0;
  await db.instance.memoryEntries.put({
    id: newId(),
    order: lastOrder + 100,
    text: textValue.trim(),
    category: memoryFormat.categoryOfText(textValue),
    createdAt: now,
    updatedAt: now,
  });
  dbEvents.emit({ scope: "memory" });
  const next = await list();
  return { total: next.length };
};

const remove = async (lineNumber: number) => {
  const entries = await list();
  if (lineNumber < 1 || lineNumber > entries.length) {
    throw new Error(`Line ${lineNumber} not found. You have ${entries.length} memories (1-${entries.length}).`);
  }

  const target = entries[lineNumber - 1]!;
  await db.instance.memoryEntries.delete(target.id);
  dbEvents.emit({ scope: "memory" });
  return { removed: target.text, remaining: entries.length - 1 };
};

const replace = async (lineNumber: number, textValue: string) => {
  const entries = await list();
  if (lineNumber < 1 || lineNumber > entries.length) {
    throw new Error(`Line ${lineNumber} not found. You have ${entries.length} memories (1-${entries.length}).`);
  }

  const target = entries[lineNumber - 1]!;
  await db.instance.memoryEntries.put({
    ...target,
    text: textValue.trim(),
    category: memoryFormat.categoryOfText(textValue),
    updatedAt: new Date().toISOString(),
  });
  dbEvents.emit({ scope: "memory" });
  return { updated: textValue.trim(), total: entries.length };
};

export const memoryRepo = {
  list,
  text,
  replaceAllFromText,
  add,
  remove,
  replace,
} as const;
