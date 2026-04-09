import type { ToolSpec } from "../types.js";

export const toOpenAITools = (tools: ToolSpec[]) =>
  tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

export const toAnthropicTools = (tools: ToolSpec[]) =>
  tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));

export const toGeminiTools = (tools: ToolSpec[]) => {
  if (tools.length === 0) return [];
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  }];
};

export const toOllamaTools = toOpenAITools;
