import { afterEach, describe, expect, it } from "bun:test";
import { gemini } from "../../src/index.js";
import { fixtureJson, fixtureText, jsonResponse, textResponse } from "../helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("gemini provider", () => {
  it("maps complete responses and function calls", async () => {
    globalThis.fetch = (async () => jsonResponse(await fixtureJson("../fixtures/gemini/complete.json"))) as typeof fetch;

    const provider = gemini("gemini-2.0-flash", { apiKey: "x" });
    const result = await provider.complete({ messages: [] });
    expect(result.message.content.some((block) => block.type === "tool_call")).toBe(true);
    expect(result.usage?.total).toBe(3);
  });

  it("streams text and function calls", async () => {
    globalThis.fetch = (async () =>
      textResponse(await fixtureText("../fixtures/gemini/stream.sse"), "text/event-stream")) as typeof fetch;

    const provider = gemini("gemini-2.0-flash", { apiKey: "x" });
    const events = [];
    for await (const event of provider.stream({ messages: [] })) events.push(event);

    expect(events.some((event) => event.type === "text")).toBe(true);
    expect(events.some((event) => event.type === "tool_call")).toBe(true);
  });
});
