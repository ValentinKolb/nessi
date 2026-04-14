import type { MemoryEntry } from "./memory.types.js";

const MAX_PROMPT_CHARS = 3200;
const PRIORITY_CATEGORIES = new Set(["fact", "preference", "person"]);

const numberLines = (lines: string[]) =>
  lines.map((line, index) => `${index + 1}. ${line}`).join("\n");

const categoryOfText = (text: string) => {
  const match = text.match(/^\[(\w+)/);
  return match?.[1]?.toLowerCase() ?? "fact";
};

const formatAll = (entries: MemoryEntry[]) => {
  const lines = entries.map((entry) => entry.text);
  if (lines.length === 0) return "No memories yet.";
  return numberLines(lines);
};

const formatForPrompt = (entries: MemoryEntry[]) => {
  const lines = entries.map((entry) => entry.text);
  if (lines.length === 0) return "No memories yet.";

  const full = numberLines(lines);
  if (full.length <= MAX_PROMPT_CHARS) return full;

  const priority = lines.filter((line) => PRIORITY_CATEGORIES.has(categoryOfText(line)));
  const rest = lines.filter((line) => !PRIORITY_CATEGORIES.has(categoryOfText(line)));

  const included = [...priority];
  let cut = 0;
  for (let index = rest.length - 1; index >= 0; index--) {
    const candidate = [...included, rest[index]!];
    const formatted = numberLines(candidate);
    if (formatted.length <= MAX_PROMPT_CHARS - 60) included.push(rest[index]!);
    else cut += 1;
  }

  const ordered = lines.filter((line) => included.includes(line));
  const result = numberLines(ordered);
  return cut > 0 ? `${result}\n(${cut} more memories not shown — use memory_recall to see all)` : result;
};

const topicSuggestions = (entries: MemoryEntry[]) =>
  entries
    .filter((entry) => entry.category === "followup" || entry.category === "project")
    .map((entry) => entry.text.replace(/^\[\w+(?:\s*-\s*[^\]]+)?\]\s*/, "").trim())
    .filter(Boolean);

export const memoryFormat = {
  categoryOfText,
  formatAll,
  formatForPrompt,
  topicSuggestions,
} as const;
