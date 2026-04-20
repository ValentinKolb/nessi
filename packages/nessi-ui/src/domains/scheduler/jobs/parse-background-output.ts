/** Parsed result from the background agent's structured text response. */
export type BackgroundOutput = {
  title: string;
  description: string;
  topics: string[];
  memoryOps: MemoryOp[];
};

export type MemoryOp =
  | { type: "add"; text: string; reason: string }
  | { type: "replace"; line: number; text: string; reason: string }
  | { type: "remove"; line: number; reason: string };

/**
 * Parse the background agent's text response into structured data.
 *
 * Expected format:
 * ```
 * TITLE: <text>
 *
 * DESCRIPTION:
 * <text lines>
 *
 * TOPICS:
 * - <topic 1>
 * - <topic 2>
 *
 * MEMORY_ADD: <text> | <reason>
 * MEMORY_REPLACE <N>: <text> | <reason>
 * MEMORY_REMOVE <N>: | <reason>
 * ```
 */
export const parseBackgroundOutput = (raw: string, fallbackTitle: string): BackgroundOutput => {
  const text = raw.trim();

  // --- Title ---
  const title = extractTitle(text) || fallbackTitle;

  // --- Description ---
  const description = extractDescription(text);

  // --- Topics ---
  const topics = extractTopics(text);

  // --- Memory operations ---
  const memoryOps = extractMemoryOps(text);

  return { title, description, topics, memoryOps };
};

const extractTitle = (text: string): string => {
  const match = text.match(/^TITLE:\s*(.+)/m);
  if (!match) return "";
  return cleanLine(match[1]!).slice(0, 80);
};

const extractDescription = (text: string): string => {
  const start = text.indexOf("DESCRIPTION:");
  if (start < 0) return "";

  const after = text.slice(start + "DESCRIPTION:".length);

  // Find the end: next section marker
  const endMarkers = ["TOPICS:", "MEMORY_ADD:", "MEMORY_REPLACE", "MEMORY_REMOVE", "MEMORY:"];
  let end = after.length;
  for (const marker of endMarkers) {
    const idx = after.indexOf(marker);
    if (idx >= 0 && idx < end) end = idx;
  }

  return after.slice(0, end).trim().slice(0, 2000);
};

const extractTopics = (text: string): string[] => {
  const start = text.indexOf("TOPICS:");
  if (start < 0) return [];

  const after = text.slice(start + "TOPICS:".length);

  // Find the end: next non-topic section
  const endMarkers = ["MEMORY_ADD:", "MEMORY_REPLACE", "MEMORY_REMOVE", "MEMORY:"];
  let end = after.length;
  for (const marker of endMarkers) {
    const idx = after.indexOf(marker);
    if (idx >= 0 && idx < end) end = idx;
  }

  return after
    .slice(0, end)
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 15);
};

const extractMemoryOps = (text: string): MemoryOp[] => {
  const ops: MemoryOp[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // MEMORY_ADD: <text> | <reason>
    const addMatch = trimmed.match(/^MEMORY_ADD:\s*(.+)/);
    if (addMatch) {
      const [memText, reason] = splitReason(addMatch[1]!);
      if (memText) ops.push({ type: "add", text: memText, reason });
      continue;
    }

    // MEMORY_REPLACE <N>: <text> | <reason>
    const replaceMatch = trimmed.match(/^MEMORY_REPLACE\s+(\d+):\s*(.+)/);
    if (replaceMatch) {
      const lineNum = parseInt(replaceMatch[1]!, 10);
      const [memText, reason] = splitReason(replaceMatch[2]!);
      if (memText && lineNum > 0) ops.push({ type: "replace", line: lineNum, text: memText, reason });
      continue;
    }

    // MEMORY_REMOVE <N>: | <reason>
    const removeMatch = trimmed.match(/^MEMORY_REMOVE\s+(\d+):\s*(.*)/);
    if (removeMatch) {
      const lineNum = parseInt(removeMatch[1]!, 10);
      const [, reason] = splitReason(removeMatch[2]!);
      if (lineNum > 0) ops.push({ type: "remove", line: lineNum, reason });
    }
  }

  return ops;
};

/** Split "memory text | reason" into [text, reason]. */
const splitReason = (raw: string): [string, string] => {
  const idx = raw.lastIndexOf(" | ");
  if (idx < 0) return [raw.trim(), ""];
  return [raw.slice(0, idx).trim(), raw.slice(idx + 3).trim()];
};

const cleanLine = (line: string) =>
  line.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();

/**
 * Apply memory operations in the correct order:
 * 1. REMOVE (highest line numbers first to avoid index shifting)
 * 2. REPLACE (highest line numbers first)
 * 3. ADD (appended at end)
 */
export const applyMemoryOps = (
  currentLines: string[],
  ops: MemoryOp[],
): { lines: string[]; applied: number; skipped: number } => {
  const lines = [...currentLines];
  let applied = 0;
  let skipped = 0;

  // 1. Remove (highest first)
  const removes = ops
    .filter((op): op is Extract<MemoryOp, { type: "remove" }> => op.type === "remove")
    .sort((a, b) => b.line - a.line);

  for (const op of removes) {
    if (op.line >= 1 && op.line <= lines.length) {
      lines.splice(op.line - 1, 1);
      applied++;
    } else {
      skipped++;
    }
  }

  // 2. Replace (highest first — after removes, so line numbers may have shifted)
  // Note: we re-index after removes, so line numbers from the LLM may be slightly off.
  // This is a known limitation; the LLM sees the original line numbers.
  const replaces = ops
    .filter((op): op is Extract<MemoryOp, { type: "replace" }> => op.type === "replace")
    .sort((a, b) => b.line - a.line);

  for (const op of replaces) {
    // Adjust line number for any removes that happened before this line
    let adjustedLine = op.line;
    for (const rm of removes) {
      if (rm.line < op.line) adjustedLine--;
    }
    if (adjustedLine >= 1 && adjustedLine <= lines.length) {
      lines[adjustedLine - 1] = op.text;
      applied++;
    } else {
      skipped++;
    }
  }

  // 3. Add (append)
  const adds = ops.filter((op): op is Extract<MemoryOp, { type: "add" }> => op.type === "add");
  for (const op of adds) {
    lines.push(op.text);
    applied++;
  }

  return { lines: lines.filter((l) => l.trim()), applied, skipped };
};
