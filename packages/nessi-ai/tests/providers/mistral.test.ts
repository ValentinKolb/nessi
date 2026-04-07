import { afterEach, describe, expect, it } from "bun:test";
import { mistral } from "../../src/index.js";
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
});
