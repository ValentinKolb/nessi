import { expect } from "bun:test";
import type { GenerateRequest, Provider, StreamEvent } from "../../src/types.js";

export async function collectStream(provider: Provider, request: GenerateRequest): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of provider.stream(request)) {
    events.push(event);
  }
  return events;
}

export async function expectProviderContract(provider: Provider, request: GenerateRequest) {
  const result = await provider.complete(request);
  const events = await collectStream(provider, request);

  const streamedText = events
    .filter((event): event is Extract<StreamEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.delta)
    .join("");
  const streamedTools = events.filter((event) => event.type === "tool_call");

  const resultText = result.message.content
    .filter((block): block is Extract<typeof result.message.content[number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  const resultTools = result.message.content.filter((block) => block.type === "tool_call");

  expect(streamedText).toBe(resultText);
  expect(streamedTools.length).toBe(resultTools.length);
  expect(result.finishReason).toBeDefined();
}
