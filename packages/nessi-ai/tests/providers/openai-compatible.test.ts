import { afterEach, describe, expect, it } from "bun:test";
import { openAICompatible, openrouter } from "../../src/index.js";
import { expectProviderContract } from "../contracts/provider-contract.js";
import { fixtureJson, fixtureText, jsonResponse, textResponse } from "../helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("openAICompatible provider", () => {
  it("supports complete and stream contract for simple text", async () => {
    const provider = openAICompatible({
      name: "custom",
      model: "gpt-test",
      baseURL: "https://example.com/v1",
      compat: { supportsUsageInStreaming: true, thinkingFormat: "none" },
    });

    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) return jsonResponse(await fixtureJson("../fixtures/openai/complete.json"));
      return textResponse(await fixtureText("../fixtures/openai/stream.sse"), "text/event-stream");
    }) as typeof fetch;

    await expectProviderContract(provider, { messages: [] });
  });

  it("flushes streamed tool calls at stream end and normalizes strict ids", async () => {
    const provider = openAICompatible({
      name: "strict",
      model: "mistral-small-latest",
      baseURL: "https://example.com/v1",
      compat: {
        toolCallIdPolicy: "strict9",
        supportsUsageInStreaming: true,
        thinkingFormat: "none",
      },
    });

    let capturedBody: any;
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return textResponse(await fixtureText("../fixtures/openai/strict-tool-stream.sse"), "text/event-stream");
    }) as typeof fetch;

    const messages = [
      { role: "user", content: [{ type: "text" as const, text: "find" }] },
      {
        role: "assistant" as const,
        content: [{ type: "tool_call" as const, id: "call_abc123456789", name: "search", args: { q: "hello" } }],
      },
      { role: "tool_result" as const, callId: "call_abc123456789", name: "search", result: { ok: true } },
    ];

    const events = [];
    for await (const event of provider.stream({ messages })) events.push(event);

    expect(events.find((event) => event.type === "tool_call")).toBeDefined();
    const assistantMessage = capturedBody.messages.find((message: any) => message.role === "assistant");
    expect(/^[A-Za-z0-9]{9}$/.test(assistantMessage.tool_calls[0].id)).toBe(true);
  });

  it("maps openrouter reasoning details to thinking events", async () => {
    const provider = openrouter("openai/gpt-4.1-mini", { apiKey: "x", baseURL: "https://openrouter.ai/api/v1" });
    globalThis.fetch = (async () =>
      textResponse(await fixtureText("../fixtures/openrouter/reasoning.sse"), "text/event-stream")) as typeof fetch;

    const events = [];
    for await (const event of provider.stream({ messages: [] })) events.push(event);

    expect(events.some((event) => event.type === "thinking")).toBe(true);
    expect(events.some((event) => event.type === "text")).toBe(true);
  });
});
