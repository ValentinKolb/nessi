import { z } from "zod";
import { defineTool } from "nessi-core";
import { readString, removeKey, writeString } from "../json-storage.js";

const STORAGE_KEY = "nessi:memory";

const read = () => readString(STORAGE_KEY);

const write = (text: string) => {
  if (text.trim()) writeString(STORAGE_KEY, text.trim());
  else removeKey(STORAGE_KEY);
};

export const memoryTool = defineTool({
  name: "memory",
  description:
    "Manage your long-term memory. Use 'recall' at the start of every conversation to know who you're talking to. Use 'append' immediately when you learn something new. Use 'clear' only when the user explicitly asks for it. Example inputs: {\"action\":\"recall\"} or {\"action\":\"append\",\"text\":\"Prefers German\"}.",
  inputSchema: z.object({
    action: z.enum(["recall", "append", "clear"]).describe(
      "Required action. recall: read all memory. append: add new information. clear: erase all memory. Example: 'recall'",
    ),
    text: z.string().optional().describe(
      "Text to append. Required when action is 'append'. Example: 'User's name is Valentin'",
    ),
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
