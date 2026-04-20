import { z } from "zod";
import { defineTool } from "nessi-core";
import { addMemory, removeMemory, formatAll } from "../memory.js";

export const memoryTool = defineTool({
  name: "memory",
  description:
    'Manage persistent user memories. Actions: "add" (save new), "remove" (delete by line number), "recall" (show all).\n' +
    'Add: {"action":"add","text":"[fact] Name is Valentin"}\n' +
    'Remove: {"action":"remove","id":3}\n' +
    'Recall: {"action":"recall"}',
  inputSchema: z.object({
    action: z.enum(["add", "remove", "recall"]).describe("Action to perform."),
    text: z.string().optional().describe("Memory line with [category] tag. Required for add."),
    id: z.coerce.number().int().positive().optional().describe("Line number. Required for remove."),
  }),
  outputSchema: z.object({ result: z.string() }),
}).server(async (input) => {
  switch (input.action) {
    case "add": {
      if (!input.text) return { result: "Error: text is required for add." };
      const { total } = await addMemory(input.text);
      return { result: `Saved: ${input.text} (${total} total)` };
    }
    case "remove": {
      if (!input.id) return { result: "Error: id is required for remove." };
      try {
        const { removed, remaining } = await removeMemory(input.id);
        return { result: `Removed line ${input.id}: ${removed} (${remaining} remaining)` };
      } catch (e) {
        return { result: `Error: ${e instanceof Error ? e.message : "unknown"}` };
      }
    }
    case "recall": {
      return { result: await formatAll() };
    }
  }
});
