import { readString, removeKey, writeString } from "./json-storage.js";

const STORAGE_KEY = "nessi:memory";
const MAX_PROMPT_CHARS = 3200;
const PRIORITY_CATEGORIES = new Set(["fact", "preference", "person"]);

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const readMemories = () => {
  let val = readString(STORAGE_KEY);
  // Migrate old JSON array format
  if (val.startsWith("[")) {
    try {
      const entries = JSON.parse(val) as Array<{ content: string; category: string }>;
      val = entries.map((e) => `[${e.category}] ${e.content}`).join("\n");
      writeString(STORAGE_KEY, val);
    } catch { /* keep as-is */ }
  }
  return val;
};

export const writeMemories = (text: string) => {
  const trimmed = text.trim();
  if (trimmed) writeString(STORAGE_KEY, trimmed);
  else removeKey(STORAGE_KEY);
};

export const getMemoryLines = () =>
  readMemories().split("\n").filter((line) => line.trim());

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const addMemory = (text: string) => {
  const current = readMemories();
  writeMemories(current ? `${current}\n${text.trim()}` : text.trim());
  return { total: getMemoryLines().length };
};

export const removeMemory = (lineNumber: number) => {
  const lines = getMemoryLines();
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} not found. You have ${lines.length} memories (1-${lines.length}).`);
  }
  const removed = lines[lineNumber - 1]!;
  lines.splice(lineNumber - 1, 1);
  writeMemories(lines.join("\n"));
  return { removed, remaining: lines.length };
};

export const replaceMemory = (lineNumber: number, text: string) => {
  const lines = getMemoryLines();
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} not found. You have ${lines.length} memories (1-${lines.length}).`);
  }
  lines[lineNumber - 1] = text.trim();
  writeMemories(lines.join("\n"));
  return { updated: text.trim(), total: lines.length };
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const numberLines = (lines: string[]) =>
  lines.map((line, i) => `${i + 1}. ${line}`).join("\n");

const getCategory = (line: string) => {
  const match = line.match(/^\[(\w+)/);
  return match ? match[1]!.toLowerCase() : "";
};

/** All memories numbered — for memory_recall tool. */
export const formatAll = () => {
  const lines = getMemoryLines();
  if (lines.length === 0) return "No memories yet.";
  return numberLines(lines);
};

/** Memories for prompt injection — with token budget and priority filtering. */
export const formatForPrompt = () => {
  const lines = getMemoryLines();
  if (lines.length === 0) return "No memories yet.";

  const full = numberLines(lines);
  if (full.length <= MAX_PROMPT_CHARS) return full;

  // Priority filtering: always keep fact/preference/person, trim project/followup
  const priority: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    if (PRIORITY_CATEGORIES.has(getCategory(line))) priority.push(line);
    else rest.push(line);
  }

  // Add rest lines (most recent first = bottom of list) until budget
  const included = [...priority];
  let cut = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const candidate = [...included, rest[i]!];
    const formatted = numberLines(candidate);
    if (formatted.length <= MAX_PROMPT_CHARS - 60) { // leave room for the "N more" note
      included.push(rest[i]!);
    } else {
      cut++;
    }
  }

  // Re-sort included to match original order
  const originalOrder = lines.filter((line) => included.includes(line));
  const result = numberLines(originalOrder);

  if (cut > 0) {
    return `${result}\n(${cut} more memories not shown — use memory_recall to see all)`;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Topic Suggestions
// ---------------------------------------------------------------------------

export const getTopicSuggestions = () =>
  getMemoryLines()
    .filter((line) => {
      const cat = getCategory(line);
      return cat === "followup" || cat === "project";
    })
    .map((line) => line.replace(/^\[\w+(?:\s*-\s*[^\]]+)?\]\s*/, "").trim())
    .filter(Boolean);
