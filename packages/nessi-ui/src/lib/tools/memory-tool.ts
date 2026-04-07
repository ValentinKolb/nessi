import { z } from "zod";
import { defineTool } from "nessi-core";
import { readString, removeKey, writeString } from "../json-storage.js";

const STORAGE_KEY = "nessi:memory";

function read(): string {
  return readString(STORAGE_KEY);
}

function write(text: string) {
  if (text.trim()) writeString(STORAGE_KEY, text.trim());
  else removeKey(STORAGE_KEY);
}

export const memoryTool = defineTool({
  name: "memory",
  description:
    "Manage your long-term memory. Use 'recall' at the start of every conversation to know who you're talking to. Use 'append' immediately when you learn something new — don't wait.",
  inputSchema: z.object({
    action: z.enum(["recall", "append", "clear"]).describe(
      "recall: read all memory. append: add new information. clear: erase all memory.",
    ),
    text: z.string().optional().describe("Text to append (required for append)"),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
}).server(async (input) => {
  switch (input.action) {
    case "recall":
      return { result: read() || "No memories stored." };
    case "append": {
      if (!input.text) return { result: "Error: text is required for append." };
      const current = read();
      write(current ? current + "\n" + input.text : input.text);
      return { result: "Memory updated." };
    }
    case "clear":
      write("");
      return { result: "Memory cleared." };
  }
});
