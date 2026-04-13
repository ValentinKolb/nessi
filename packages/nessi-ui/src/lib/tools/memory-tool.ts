import { z } from "zod";
import { defineTool } from "nessi-core";
import { addMemory, removeMemory, replaceMemory, formatAll } from "../memory.js";

export const memoryAddTool = defineTool({
  name: "memory_add",
  description:
    "Save a new memory. Write the full line including [category] tag and optional date. " +
    "Categories: [fact], [preference], [project], [person], [followup]. " +
    'Example: {"text":"[fact] Name is Valentin"}',
  inputSchema: z.object({
    text: z.string().describe('The memory line to save. Example: "[preference] Speaks German"'),
  }),
  outputSchema: z.object({ status: z.string(), total: z.number() }),
}).server(async (input) => {
  const { total } = addMemory(input.text);
  return { status: `Saved: ${input.text}`, total };
});

export const memoryRemoveTool = defineTool({
  name: "memory_remove",
  description:
    "Remove a memory by its line number from the memories list in the system prompt. " +
    'Example: {"id":3}',
  inputSchema: z.object({
    id: z.coerce.number().int().positive().describe("Line number of the memory to remove."),
  }),
  outputSchema: z.object({ status: z.string() }),
}).server(async (input) => {
  try {
    const { removed, remaining } = removeMemory(input.id);
    return { status: `Removed line ${input.id}: ${removed} (${remaining} remaining)` };
  } catch (e) {
    return { status: `Error: ${e instanceof Error ? e.message : "unknown"}` };
  }
});

export const memoryReplaceTool = defineTool({
  name: "memory_replace",
  description:
    "Update a memory by its line number. Give the line number and the new full text. " +
    'Example: {"id":3,"text":"[fact] Now CTO at Kolb Antik"}',
  inputSchema: z.object({
    id: z.coerce.number().int().positive().describe("Line number of the memory to update."),
    text: z.string().describe("New text for this memory line."),
  }),
  outputSchema: z.object({ status: z.string() }),
}).server(async (input) => {
  try {
    const { updated, total } = replaceMemory(input.id, input.text);
    return { status: `Updated line ${input.id}: ${updated} (${total} total)` };
  } catch (e) {
    return { status: `Error: ${e instanceof Error ? e.message : "unknown"}` };
  }
});

export const memoryRecallTool = defineTool({
  name: "memory_recall",
  description:
    "Retrieve all memories including those not shown in the system prompt due to token budget. " +
    "Only use this when the memories list says some entries were not shown.",
  inputSchema: z.object({}),
  outputSchema: z.object({ memories: z.string() }),
}).server(async () => ({ memories: formatAll() }));
