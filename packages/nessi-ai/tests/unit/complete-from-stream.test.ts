import { describe, expect, it } from "bun:test";
import { completeFromStream } from "../../src/complete-from-stream.js";
import type { GenerateRequest, Provider } from "../../src/types.js";

describe("completeFromStream", () => {
  it("aggregates text, thinking, tool calls and usage", async () => {
    const provider: Provider = {
      name: "mock",
      family: "openai-compatible",
      model: "mock",
      contextWindow: 1000,
      capabilities: { streaming: true, tools: true, images: true, thinking: true, usage: true },
      async *stream() {
        yield { type: "thinking", delta: "hmm" } as const;
        yield { type: "text", delta: "hello" } as const;
        yield { type: "tool_start", callId: "c1", name: "search" } as const;
        yield { type: "tool_delta", callId: "c1", argsDelta: "{\"q\"" } as const;
        yield { type: "tool_call", callId: "c1", name: "search", args: { q: "x" } } as const;
        yield { type: "usage", usage: { input: 1, output: 2, total: 3 } } as const;
      },
      complete(request: GenerateRequest) {
        return completeFromStream(provider, request);
      },
    };

    const result = await completeFromStream(provider, { messages: [] });
    expect(result.finishReason).toBe("tool_use");
    expect(result.usage?.total).toBe(3);
    expect(result.message.content.map((block) => block.type)).toEqual(["text", "thinking", "tool_call"]);
  });

  it("prefers the provider-reported finish reason when available", async () => {
    const provider: Provider = {
      name: "mock",
      family: "openai-compatible",
      model: "mock",
      contextWindow: 1000,
      capabilities: { streaming: true, tools: true, images: true, thinking: true, usage: true },
      async *stream() {
        yield { type: "text", delta: "partial" } as const;
        yield {
          type: "usage",
          usage: { input: 1, output: 2, total: 3 },
          finishReason: "max_tokens",
        } as const;
      },
      complete(request: GenerateRequest) {
        return completeFromStream(provider, request);
      },
    };

    const result = await completeFromStream(provider, { messages: [] });
    expect(result.finishReason).toBe("max_tokens");
  });
});
