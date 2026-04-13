/** Lightweight date formatting utilities for relative time and display. */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Relative time string: "just now", "3m ago", "2h ago", "5d ago", etc.
 * Accepts ISO string, Date object, or epoch milliseconds.
 */
export const timeAgo = (input: string | Date | number): string => {
  const date = input instanceof Date ? input : new Date(input);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}w ago`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo ago`;
  return `${Math.floor(diff / YEAR)}y ago`;
};

/**
 * Short time: "14:32" for today, "Mon" for this week, "12 Apr" for this year, "12 Apr 2024" for older.
 */
export const shortTime = (input: string | Date | number): string => {
  const date = input instanceof Date ? input : new Date(input);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < DAY && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  if (diff < WEEK) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Full timestamp for message metadata: "14:32" for today, "12 Apr 2026, 14:32" otherwise.
 */
export const messageTime = (input: string | Date | number): string => {
  const date = input instanceof Date ? input : new Date(input);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < DAY && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
