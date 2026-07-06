import type {
  AssistantContentBlock,
  GenerateRequest,
  GenerateResult,
  Provider,
  ToolCallBlock,
  Usage,
} from "./types.js";
import { appendAssistantContentBlock, buildAssistantMessageFromContent } from "./shared/messages.js";

export const completeFromStream = async (
  provider: Pick<Provider, "model" | "stream">,
  request: GenerateRequest,
): Promise<GenerateResult> => {
  let usage: Usage | undefined;
  let finishReason: GenerateResult["finishReason"] | undefined;
  const content: AssistantContentBlock[] = [];
  const toolCalls: ToolCallBlock[] = [];

  for await (const event of provider.stream(request)) {
    switch (event.type) {
      case "text":
        appendAssistantContentBlock(content, { type: "text", text: event.delta });
        break;
      case "thinking":
        appendAssistantContentBlock(content, { type: "thinking", thinking: event.delta });
        break;
      case "tool_call":
        {
          const block: ToolCallBlock = { type: "tool_call", id: event.callId, name: event.name, args: event.args };
          toolCalls.push(block);
          appendAssistantContentBlock(content, block);
        }
        break;
      case "tool_error":
      case "tool_cancel":
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
    message: buildAssistantMessageFromContent(provider.model, content, usage, finishReason),
    usage,
    finishReason,
    providerMeta: { model: provider.model },
  };
};
