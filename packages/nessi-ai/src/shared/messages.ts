import type {
  AssistantMessage,
  ContentPart,
  InputFilePart,
  Message,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
} from "../types.js";

export function textPart(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

export function textBlock(text: string): TextBlock {
  return { type: "text", text };
}

export function thinkingBlock(thinking: string): ThinkingBlock {
  return { type: "thinking", thinking };
}

export function toolCallBlock(id: string, name: string, args: Record<string, unknown>): ToolCallBlock {
  return { type: "tool_call", id, name, args };
}

export function contentPartToText(part: ContentPart): string {
  if (typeof part === "string") return part;
  if (part.type === "text") return part.text;
  return "";
}

export function isImageFilePart(part: ContentPart): part is InputFilePart {
  return typeof part !== "string" && part.type === "file" && part.mediaType.startsWith("image/");
}

export function assertOnlySupportedFiles(
  parts: ContentPart[],
  supportImages: boolean,
  label: string,
): void {
  for (const part of parts) {
    if (typeof part === "string" || part.type === "text") continue;
    if (supportImages && part.mediaType.startsWith("image/")) continue;
    throw new Error(`${label} does not support input file type '${part.mediaType}'.`);
  }
}

export function buildAssistantMessage(
  model: string,
  text: string,
  thinking: string,
  toolCalls: ToolCallBlock[],
  usage?: AssistantMessage["usage"],
  stopReason?: AssistantMessage["stopReason"],
): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  if (text) content.push(textBlock(text));
  if (thinking) content.push(thinkingBlock(thinking));
  for (const toolCall of toolCalls) content.push(toolCall);
  return { role: "assistant", content, model, usage, stopReason };
}

export function extractAssistantText(message: Message): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
