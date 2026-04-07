import { afterEach, describe, expect, it } from "bun:test";
import { anthropic } from "../../src/index.js";
import { fixtureJson, fixtureText, jsonResponse, textResponse } from "../helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("anthropic provider", () => {
  it("maps complete tool_use blocks", async () => {
    globalThis.fetch = (async () => jsonResponse(await fixtureJson("../fixtures/anthropic/complete.json"))) as typeof fetch;

    const provider = anthropic("claude-sonnet");
    const result = await provider.complete({ messages: [] });
    expect(result.finishReason).toBe("tool_use");
    expect(result.message.content.some((block) => block.type === "tool_call")).toBe(true);
  });

  it("streams text and tool input deltas", async () => {
    globalThis.fetch = (async () =>
      textResponse(await fixtureText("../fixtures/anthropic/stream.sse"), "text/event-stream")) as typeof fetch;

    const provider = anthropic("claude-sonnet");
    const events = [];
    for await (const event of provider.stream({ messages: [] })) events.push(event);

    expect(events.some((event) => event.type === "tool_delta")).toBe(true);
    expect(events.some((event) => event.type === "tool_call")).toBe(true);
    expect(events.some((event) => event.type === "usage")).toBe(true);
  });
});
