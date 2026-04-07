import type {
  GenerateRequest,
  GenerateResult,
  Provider,
  StreamEvent,
  ToolCallBlock,
  Usage,
} from "./types.js";
import { buildAssistantMessage } from "./shared/messages.js";

export async function completeFromStream(
  provider: Pick<Provider, "model" | "stream">,
  request: GenerateRequest,
): Promise<GenerateResult> {
  let text = "";
  let thinking = "";
  let usage: Usage | undefined;
  let finishReason: GenerateResult["finishReason"] | undefined;
  const toolCalls: ToolCallBlock[] = [];

  for await (const event of provider.stream(request)) {
    if (event.type === "text") text += event.delta;
    else if (event.type === "thinking") thinking += event.delta;
    else if (event.type === "tool_call") {
      toolCalls.push({ type: "tool_call", id: event.callId, name: event.name, args: event.args });
    } else if (event.type === "usage") {
      usage = event.usage;
      finishReason = event.finishReason ?? finishReason;
    } else if (event.type === "error") throw new Error(event.error);
  }

  finishReason ??= toolCalls.length > 0 ? "tool_use" : "stop";
  return {
    message: buildAssistantMessage(provider.model, text, thinking, toolCalls, usage, finishReason),
    usage,
    finishReason,
    providerMeta: { model: provider.model },
  };
}
