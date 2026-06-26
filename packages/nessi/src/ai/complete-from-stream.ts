import type {
  GenerateRequest,
  GenerateResult,
  Provider,
  ToolCallBlock,
  Usage,
} from "./types.js";
import { buildAssistantMessage } from "./shared/messages.js";

export const completeFromStream = async (
  provider: Pick<Provider, "model" | "stream">,
  request: GenerateRequest,
): Promise<GenerateResult> => {
  let text = "";
  let thinking = "";
  let usage: Usage | undefined;
  let finishReason: GenerateResult["finishReason"] | undefined;
  const toolCalls: ToolCallBlock[] = [];

  for await (const event of provider.stream(request)) {
    switch (event.type) {
      case "text":
        text += event.delta;
        break;
      case "thinking":
        thinking += event.delta;
        break;
      case "tool_call":
        toolCalls.push({ type: "tool_call", id: event.callId, name: event.name, args: event.args });
        break;
      case "usage":
        usage = event.usage;
        finishReason = event.finishReason ?? finishReason;
        break;
      case "error":
        throw new Error(event.error);
    }
  }

  finishReason ??= toolCalls.length > 0 ? "tool_use" : "stop";
  return {
    message: buildAssistantMessage(provider.model, text, thinking, toolCalls, usage, finishReason),
    usage,
    finishReason,
    providerMeta: { model: provider.model },
  };
};
