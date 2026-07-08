import { afterEach, describe, expect, it } from "bun:test";
import { mistral } from "../../../src/ai/index.js";
import { fixtureJson, jsonResponse } from "../helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("mistral provider", () => {
  it("supports complete through the mistral preset", async () => {
    globalThis.fetch = (async () => jsonResponse(await fixtureJson("../fixtures/mistral/complete.json"))) as typeof fetch;

    const provider = mistral("mistral-small-latest");
    const result = await provider.complete({ messages: [] });
    expect(result.finishReason).toBe("tool_use");
    expect(result.message.content.some((block) => block.type === "tool_call")).toBe(true);
  });

  it("sends temperature 0 explicitly", async () => {
    let capturedBody: any;
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse(await fixtureJson("../fixtures/mistral/complete.json"));
    }) as typeof fetch;

    const provider = mistral("mistral-small-latest", { temperature: 0.8 });
    await provider.complete({ messages: [], temperature: 0 });

    expect(capturedBody.temperature).toBe(0);
  });

  it("maps responseFormat to json_schema response_format", async () => {
    let capturedBody: any;
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse(await fixtureJson("../fixtures/mistral/complete.json"));
    }) as typeof fetch;

    const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
    const provider = mistral("mistral-small-latest");
    await provider.complete({
      messages: [],
      responseFormat: { type: "json_schema", name: "card", schema },
    });

    expect(capturedBody.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "card",
        schema,
        strict: true,
      },
    });
  });
});
