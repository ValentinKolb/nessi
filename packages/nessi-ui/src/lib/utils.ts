import { humanId } from "human-id";

/** Generate a short, human-readable id. */
export const newId = () => humanId({ separator: "-", capitalize: false });

/** Shared localStorage prefix for chat data. */
export const CHAT_PREFIX = "chat:";

/** Build the localStorage key for a chat's entry list. */
export const chatEntriesKey = (chatId: string) => `${CHAT_PREFIX}${chatId}:entries`;

/** Extract plain text from a mixed content-parts array. */
export const contentPartsToText = (parts: Array<string | { type: string; text?: string }>) =>
  parts.map((p) => (typeof p === "string" ? p : p.type === "text" && p.text ? p.text : "")).join(" ").trim();

/** Truncate text with a descriptive suffix when it exceeds the limit. */
export const truncateText = (text: string, limit: number, label = "content") =>
  text.length <= limit
    ? text
    : text.slice(0, limit) + `\n\n... [truncated, ${(text.length - limit).toLocaleString()} chars of ${label} omitted]`;

/** Safely narrow an unknown value to a Record, or return null. */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Safely narrow an unknown value to a non-empty string, or return null. */
export const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
