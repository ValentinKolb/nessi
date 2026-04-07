import type { ToolSpec } from "../types.js";

export function toOpenAITools(tools: ToolSpec[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function toAnthropicTools(tools: ToolSpec[]): Array<{
  name: string;
  description: string;
  input_schema: unknown;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export function toGeminiTools(tools: ToolSpec[]): Array<{
  functionDeclarations: Array<{ name: string; description: string; parameters: unknown }>;
}> {
  if (tools.length === 0) return [];
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  }];
}

export function toOllamaTools(tools: ToolSpec[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}
