import { afterEach, describe, expect, it } from "bun:test";
import { ollama } from "../../src/index.js";
import { fixtureJson, fixtureText, jsonResponse, textResponse } from "../helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ollama provider", () => {
  it("supports complete", async () => {
    globalThis.fetch = (async () => jsonResponse(await fixtureJson("../fixtures/ollama/complete.json"))) as typeof fetch;

    const provider = ollama("llama3.1");
    const result = await provider.complete({ messages: [] });
    expect(result.message.content[0]).toEqual({ type: "text", text: "hello" });
    expect(result.usage?.total).toBe(5);
  });

  it("streams text and tool calls", async () => {
    globalThis.fetch = (async () =>
      textResponse(await fixtureText("../fixtures/ollama/stream.ndjson"), "application/x-ndjson")) as typeof fetch;

    const provider = ollama("llama3.1");
    const events = [];
    for await (const event of provider.stream({ messages: [] })) events.push(event);

    expect(events.filter((event) => event.type === "text")).toHaveLength(2);
    expect(events.some((event) => event.type === "tool_call")).toBe(true);
    expect(events.some((event) => event.type === "usage")).toBe(true);
  });

  it("sends temperature 0 explicitly", async () => {
    let capturedBody: any;
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse(await fixtureJson("../fixtures/ollama/complete.json"));
    }) as typeof fetch;

    const provider = ollama("llama3.1", { temperature: 0.8 });
    await provider.complete({ messages: [], temperature: 0 });

    expect(capturedBody.options).toEqual({ temperature: 0 });
  });
});
