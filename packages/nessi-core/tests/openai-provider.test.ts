import { describe, it, expect } from "bun:test";
import { openai } from "../src/providers/openai.js";
import type { Message } from "../src/types.js";

function user(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistantTool(callId: string): Message {
  return {
    role: "assistant",
    content: [{ type: "tool_call", id: callId, name: "search", args: { q: "hello" } }],
  };
}

function toolResult(callId: string): Message {
  return {
    role: "tool_result",
    callId,
    name: "search",
    result: { ok: true },
  };
}

function sseResponse(dataLines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of dataLines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("openai provider tool_call id compatibility", () => {
  it("normalizes tool_call ids when strict mode is enabled", async () => {
    const provider = openai("mistral-small-latest", {
      apiKey: "x",
      baseURL: "https://api.mistral.ai/v1",
      normalizeToolCallIds: "strict9",
    });

    const originalFetch = globalThis.fetch;
    let capturedBody: any;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return sseResponse([
        JSON.stringify({
          choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
        }),
      ]);
    }) as typeof fetch;

    try {
      const messages: Message[] = [
        user("find info"),
        assistantTool("call_26a25b3a49064a3e81dc38d8"),
        toolResult("call_26a25b3a49064a3e81dc38d8"),
      ];

      const events: Array<{ type: string }> = [];
      for await (const event of provider.stream({
        systemPrompt: "test",
        messages,
        tools: [],
      })) {
        events.push({ type: event.type });
      }

      expect(events.some((e) => e.type === "text")).toBe(true);
      const assistantMsg = capturedBody.messages.find((m: any) => m.role === "assistant");
      const toolMsg = capturedBody.messages.find((m: any) => m.role === "tool");
      const normalizedId = assistantMsg.tool_calls[0].id;
      expect(/^[A-Za-z0-9]{9}$/.test(normalizedId)).toBe(true);
      expect(toolMsg.tool_call_id).toBe(normalizedId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps tool_call ids unchanged by default", async () => {
    const provider = openai("gpt-4o-mini", {
      apiKey: "x",
      baseURL: "https://api.openai.com/v1",
    });

    const originalFetch = globalThis.fetch;
    let capturedBody: any;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return sseResponse([
        JSON.stringify({
          choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
        }),
      ]);
    }) as typeof fetch;

    try {
      const originalCallId = "call_abc123456789";
      const messages: Message[] = [
        user("find info"),
        assistantTool(originalCallId),
        toolResult(originalCallId),
      ];

      for await (const _ of provider.stream({
        systemPrompt: "test",
        messages,
        tools: [],
      })) {
        // consume
      }

      const assistantMsg = capturedBody.messages.find((m: any) => m.role === "assistant");
      const toolMsg = capturedBody.messages.find((m: any) => m.role === "tool");
      expect(assistantMsg.tool_calls[0].id).toBe(originalCallId);
      expect(toolMsg.tool_call_id).toBe(originalCallId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("drops orphan tool_result messages in strict mode", async () => {
    const provider = openai("mistral-small-latest", {
      apiKey: "x",
      baseURL: "https://api.mistral.ai/v1",
      normalizeToolCallIds: "strict9",
    });

    const originalFetch = globalThis.fetch;
    let capturedBody: any;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return sseResponse([
        JSON.stringify({
          choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
        }),
      ]);
    }) as typeof fetch;

    try {
      const messages: Message[] = [user("find info"), toolResult("orphan_call_1")];

      for await (const _ of provider.stream({
        systemPrompt: "test",
        messages,
        tools: [],
      })) {
        // consume
      }

      const toolMsgs = capturedBody.messages.filter((m: any) => m.role === "tool");
      expect(toolMsgs).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks 429 responses as retryable and parses top-level error messages", async () => {
    const provider = openai("mistral-small-latest", {
      apiKey: "x",
      baseURL: "https://api.mistral.ai/v1",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          object: "error",
          message: "Service tier capacity exceeded for this model.",
          type: "service_tier_capacity_exceeded",
          code: "3505",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const events = [];
      for await (const event of provider.stream({
        systemPrompt: "test",
        messages: [user("hello")],
        tools: [],
      })) {
        events.push(event);
      }

      const error = events.find((event) => event.type === "error");
      expect(error).toBeDefined();
      expect(error?.type).toBe("error");
      if (error?.type === "error") {
        expect(error.retryable).toBe(true);
        expect(error.error).toContain("Service tier capacity exceeded for this model.");
        expect(error.error).toContain("3505");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
