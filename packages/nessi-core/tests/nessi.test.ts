import { describe, it, expect } from "bun:test";
import { completeFromStream } from "nessi-ai";
import { z } from "zod";
import { nessi } from "../src/nessi.js";
import { defineTool } from "../src/tools.js";
import { memoryStore } from "../src/stores.js";
import { mockProvider, mockProviderMultiTurn } from "./mock-provider.js";
import type { OutboundEvent, ProviderEvent, CreditStore, SessionStore, Usage } from "../src/types.js";

// Helper: collect all events from a loop
async function collectEvents(loop: ReturnType<typeof nessi>): Promise<OutboundEvent[]> {
  const events: OutboundEvent[] = [];
  for await (const event of loop) {
    events.push(event);
  }
  return events;
}

// Helper: simple server tool
const echoTool = defineTool({
  name: "echo",
  description: "Echoes input",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ echoed: z.string() }),
}).server(async (input) => ({ echoed: input.text }));

// Helper: tool with approval
const dangerTool = defineTool({
  name: "danger",
  description: "Needs approval",
  inputSchema: z.object({ action: z.string() }),
  needsApproval: true,
}).server(async (input) => ({ done: input.action }));

// Helper: client tool
const toastTool = defineTool({
  name: "toast",
  description: "Show toast",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ shown: z.boolean() }),
}).client((input) => ({ shown: true }));

// Helper: server tool that requests a client-side survey mid-execution
const askSurveyTool = defineTool({
  name: "ask_survey",
  description: "Ask a survey via client tool bridge",
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
}).server(async (_input, ctx) => {
  const response = await ctx.requestClientTool<{ result: string }>("survey", {
    title: "Quick check",
    questions: [{ question: "Pick one", options: ["A", "B"] }],
  });
  return { result: response.result };
});

describe("nessi core loop", () => {
  it("rejects duplicate tool names", () => {
    const first = defineTool({
      name: "dup",
      description: "First",
      inputSchema: z.object({}),
    }).server(async () => ({ ok: true }));
    const second = defineTool({
      name: "dup",
      description: "Second",
      inputSchema: z.object({}),
    }).server(async () => ({ ok: true }));

    expect(() =>
      nessi({
        provider: mockProvider([]),
        store: memoryStore(),
        input: "Hi",
        tools: [first, second],
      }),
    ).toThrow("Duplicate tool name: dup");
  });

  it("emits error and done when the store throws", async () => {
    const brokenStore: SessionStore = {
      async load() {
        return [];
      },
      async append() {
        throw new Error("store failed");
      },
    };

    const events = await collectEvents(
      nessi({
        provider: mockProvider([{ type: "text", delta: "never reaches provider" }]),
        store: brokenStore,
        input: "Hi",
      }),
    );

    expect(events).toEqual([
      { type: "error", agentId: "main", error: "store failed", retryable: false },
      { type: "done", agentId: "main", reason: "error" },
    ]);
  });

  it("handles simple text response", async () => {
    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "Hello " },
          { type: "text", delta: "world!" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("turn_start");
    expect(types).toContain("text");
    expect(types).toContain("turn_end");
    expect(types).toContain("done");

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents).toHaveLength(2);
    expect((textEvents[0] as any).delta).toBe("Hello ");
    expect((textEvents[1] as any).delta).toBe("world!");

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("stop");
  });

  it("stores the provider model name on assistant messages", async () => {
    const provider = {
      ...mockProvider([
        { type: "text" as const, delta: "Hello model" },
        { type: "usage" as const, usage: { input: 10, output: 5, total: 15 } },
      ], { name: "openai" }),
      model: "gpt-4o-mini",
    };

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    const turnEnd = events.find((event) => event.type === "turn_end");
    expect(turnEnd && turnEnd.type === "turn_end" ? turnEnd.message.model : undefined).toBe("gpt-4o-mini");
  });

  it("handles thinking events", async () => {
    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "thinking", delta: "Let me think..." },
          { type: "text", delta: "Here's my answer." },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Think about this",
      }),
    );

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    expect(thinkingEvents).toHaveLength(1);
    expect((thinkingEvents[0] as any).delta).toBe("Let me think...");
  });

  it("executes server tool and continues", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "echo" },
          { type: "tool_delta", callId: "c1", argsDelta: '{"text":' },
          { type: "tool_delta", callId: "c1", argsDelta: '"hello"}' },
          { type: "tool_call", callId: "c1", name: "echo", args: { text: "hello" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "The echo said: hello" },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [echoTool],
        input: "Echo hello",
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_end");
    // Should have two turn_starts (original + after tool)
    expect(types.filter((t) => t === "turn_start")).toHaveLength(2);

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.result).toEqual({ echoed: "hello" });

    // turn_end must come AFTER tool_call and tool_end
    const firstTurnEndIdx = types.indexOf("turn_end");
    const toolCallIdx = types.indexOf("tool_call");
    const toolEndIdx = types.indexOf("tool_end");
    expect(toolCallIdx).toBeLessThan(firstTurnEndIdx);
    expect(toolEndIdx).toBeLessThan(firstTurnEndIdx);

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("stop");
  });

  it("handles client tool with push()", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "toast" },
          { type: "tool_call", callId: "c1", name: "toast", args: { message: "Done!" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Toast shown." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [toastTool],
      input: "Show a toast",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      if (event.type === "action_request" && event.kind === "client_tool") {
        loop.push({ type: "tool_result", callId: event.callId, result: { shown: true } });
      }
    }

    const actionReq = events.find((e) => e.type === "action_request") as any;
    expect(actionReq.kind).toBe("client_tool");
    expect(actionReq.name).toBe("toast");

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.result).toEqual({ shown: true });
  });

  it("supports server tool -> requestClientTool() bridge", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "ask_survey" },
          { type: "tool_call", callId: "c1", name: "ask_survey", args: {} },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Thanks!" },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [askSurveyTool],
      input: "Ask survey",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      if (event.type === "action_request" && event.kind === "client_tool" && event.name === "survey") {
        loop.push({ type: "tool_result", callId: event.callId, result: { result: "Pick one\nA" } });
      }
    }

    const actionReq = events.find((e) => e.type === "action_request") as any;
    expect(actionReq.kind).toBe("client_tool");
    expect(actionReq.name).toBe("survey");

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.result).toEqual({ result: "Pick one\nA" });
  });

  it("buffers out-of-order inbound events by callId", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "toast" },
          { type: "tool_call", callId: "c1", name: "toast", args: { message: "first" } },
          { type: "tool_start", callId: "c2", name: "toast" },
          { type: "tool_call", callId: "c2", name: "toast", args: { message: "second" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Done." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [toastTool],
      input: "Run two client tools",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      if (event.type === "action_request" && event.kind === "client_tool" && event.callId === "c1") {
        // Push c2 first, then c1. c2 should be buffered until requested.
        loop.push({ type: "tool_result", callId: "c2", result: { shown: true, which: 2 } });
        loop.push({ type: "tool_result", callId: "c1", result: { shown: true, which: 1 } });
      }
    }

    const toolEnds = events.filter((e) => e.type === "tool_end") as Array<any>;
    expect(toolEnds).toHaveLength(2);
    expect(toolEnds[0].callId).toBe("c1");
    expect(toolEnds[0].result).toEqual({ shown: true, which: 1 });
    expect(toolEnds[1].callId).toBe("c2");
    expect(toolEnds[1].result).toEqual({ shown: true, which: 2 });
  });

  it("handles approval flow — approved", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "danger" },
          { type: "tool_call", callId: "c1", name: "danger", args: { action: "delete" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Done." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [dangerTool],
      input: "Do something dangerous",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      if (event.type === "action_request" && event.kind === "approval") {
        loop.push({ type: "approval_response", callId: event.callId, approved: true });
      }
    }

    const actionReq = events.find((e) => e.type === "action_request") as any;
    expect(actionReq.kind).toBe("approval");

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBeUndefined();
  });

  it("handles approval flow — denied", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "danger" },
          { type: "tool_call", callId: "c1", name: "danger", args: { action: "delete" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "OK, cancelled." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [dangerTool],
      input: "Do something dangerous",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      if (event.type === "action_request" && event.kind === "approval") {
        loop.push({ type: "approval_response", callId: event.callId, approved: false });
      }
    }

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("denied");
  });

  it("stops at maxTurns", async () => {
    // Provider always returns tool calls → infinite loop without maxTurns
    const provider = mockProviderMultiTurn(() => [
      { type: "tool_start", callId: "c1", name: "echo" },
      { type: "tool_call", callId: "c1", name: "echo", args: { text: "loop" } },
      { type: "usage", usage: { input: 10, output: 5, total: 15 } },
    ]);

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [echoTool],
        maxTurns: 2,
        input: "Loop forever",
      }),
    );

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("max_turns");
  });

  it("stops when credits run out", async () => {
    const creditStore: CreditStore = {
      async remaining() {
        return 0;
      },
      async deduct() {},
    };

    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "hello" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        creditStore,
        input: "Hi",
      }),
    );

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("no_credits");
    // Should not have any text events — stopped before provider call
    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents).toHaveLength(0);
  });

  it("deducts credits after turn", async () => {
    let deducted = 0;
    const creditStore: CreditStore = {
      async remaining() {
        return 100;
      },
      async deduct(credits) {
        deducted += credits;
      },
    };

    await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "hello" },
          { type: "usage", usage: { input: 10, output: 5, total: 15, creditsUsed: 7 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        creditStore,
        input: "Hi",
      }),
    );

    expect(deducted).toBe(7);
  });

  it("handles abort signal", async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "hello" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        signal: controller.signal,
        input: "Hi",
      }),
    );

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("aborted");
  });

  it("handles input validation error", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "echo" },
          // Invalid args: number instead of string
          { type: "tool_call", callId: "c1", name: "echo", args: { text: 123 } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Sorry about that." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [echoTool],
        input: "Echo something",
      }),
    );

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("Validation");
    // No tool_call event should be emitted for invalid args
    const toolCalls = events.filter((e) => e.type === "tool_call");
    expect(toolCalls).toHaveLength(0);
  });

  it("handles output validation error", async () => {
    const badTool = defineTool({
      name: "bad",
      description: "Returns wrong type",
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
    }).server(async () => ({ count: "not a number" }) as any);

    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "bad" },
          { type: "tool_call", callId: "c1", name: "bad", args: {} },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Handled." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [badTool],
        input: "Do it",
      }),
    );

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("Output validation");
  });

  it("handles unknown tool name", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "nonexistent" },
          { type: "tool_call", callId: "c1", name: "nonexistent", args: {} },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "OK." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [echoTool],
        input: "Call nonexistent",
      }),
    );

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("Unknown tool");
  });

  it("handles compaction before provider call", async () => {
    let compactCalled = false;
    const store = memoryStore();

    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "Compacted!" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store,
        compact(ctx) {
          if (compactCalled) return null;
          compactCalled = true;
          return (async () => {
            await ctx.store.append(
              { role: "user", content: [{ type: "text", text: "Summary" }] },
              { seq: 0, kind: "summary" },
            );
          })();
        },
        input: "Hi",
      }),
    );

    expect(compactCalled).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("compaction_start");
    expect(types).toContain("compaction_end");
    // compaction_start should come before turn_start
    const csIdx = types.indexOf("compaction_start");
    const tsIdx = types.indexOf("turn_start");
    expect(csIdx).toBeLessThan(tsIdx);
  });

  it("handles context overflow with compaction retry", async () => {
    let callCount = 0;
    const provider: typeof echoTool extends never ? never : import("../src/types.js").Provider = {
      name: "mock",
      family: "openai-compatible",
      model: "mock",
      capabilities: {
        streaming: true,
        tools: true,
        images: true,
        thinking: true,
        usage: true,
      },
      contextWindow: 100_000,
      async *stream() {
        callCount++;
        if (callCount === 1) {
          yield { type: "error" as const, error: "context too long", retryable: false, contextOverflow: true };
          return;
        }
        yield { type: "text" as const, delta: "After compaction" };
        yield { type: "usage" as const, usage: { input: 10, output: 5, total: 15 } };
      },
      complete(request) {
        return completeFromStream(provider, request);
      },
    };

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        compact(ctx) {
          if (!ctx.force) return null;
          return (async () => {
            await ctx.store.append(
              { role: "user", content: [{ type: "text", text: "Compacted summary" }] },
              { seq: 0, kind: "summary" },
            );
          })();
        },
        input: "Hi",
      }),
    );

    expect(callCount).toBe(2);
    const types = events.map((e) => e.type);
    expect(types).toContain("compaction_start");
    expect(types).toContain("compaction_end");
    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("stop");
  });

  it("context overflow without compact → done", async () => {
    const events = await collectEvents(
      nessi({
        provider: mockProvider([{ type: "error", error: "context too long", retryable: false, contextOverflow: true }]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("context_overflow");
  });

  it("context overflow with compaction retry that also fails → no infinite loop", async () => {
    const provider: import("../src/types.js").Provider = {
      name: "mock",
      family: "openai-compatible",
      model: "mock",
      capabilities: {
        streaming: true,
        tools: true,
        images: true,
        thinking: true,
        usage: true,
      },
      contextWindow: 100_000,
      async *stream() {
        // Always overflow
        yield { type: "error" as const, error: "context too long", retryable: false, contextOverflow: true };
      },
      complete(request) {
        return completeFromStream(provider, request);
      },
    };

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        compact(ctx) {
          return (async () => {
            await ctx.store.append(
              { role: "user", content: [{ type: "text", text: "Summary" }] },
              { seq: 0, kind: "summary" },
            );
          })();
        },
        input: "Hi",
      }),
    );

    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("context_overflow");
    // Should have exactly 2 compaction rounds (normal + force retry), then give up
    const compactionStarts = events.filter((e) => e.type === "compaction_start");
    expect(compactionStarts.length).toBeLessThanOrEqual(2);
  });

  it("subscribe() receives events in parallel", async () => {
    const subscribedEvents: OutboundEvent[] = [];

    const loop = nessi({
      provider: mockProvider([
        { type: "text", delta: "Hello" },
        { type: "usage", usage: { input: 10, output: 5, total: 15 } },
      ]),
      systemPrompt: "test",
      store: memoryStore(),
      input: "Hi",
    });

    const unsub = loop.subscribe((event) => subscribedEvents.push(event));

    const iteratedEvents: OutboundEvent[] = [];
    for await (const event of loop) {
      iteratedEvents.push(event);
    }

    unsub();

    // Both should have received the same events
    expect(subscribedEvents.length).toBe(iteratedEvents.length);
    expect(subscribedEvents.map((e) => e.type)).toEqual(iteratedEvents.map((e) => e.type));
  });

  it("handles multiple tools in one turn", async () => {
    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "echo" },
          { type: "tool_call", callId: "c1", name: "echo", args: { text: "first" } },
          { type: "tool_start", callId: "c2", name: "echo" },
          { type: "tool_call", callId: "c2", name: "echo", args: { text: "second" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Both done." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [echoTool],
        input: "Echo two things",
      }),
    );

    const toolEnds = events.filter((e) => e.type === "tool_end");
    expect(toolEnds).toHaveLength(2);
    expect((toolEnds[0] as any).result).toEqual({ echoed: "first" });
    expect((toolEnds[1] as any).result).toEqual({ echoed: "second" });
  });

  it("stores messages correctly across turns", async () => {
    const store = memoryStore();

    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "echo" },
          { type: "tool_call", callId: "c1", name: "echo", args: { text: "test" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Final." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store,
        tools: [echoTool],
        input: "Echo test",
      }),
    );

    const entries = await store.load();
    // user message, assistant (tool_call), tool_result, assistant (text)
    expect(entries).toHaveLength(4);
    expect(entries[0].message.role).toBe("user");
    expect(entries[1].message.role).toBe("assistant");
    expect(entries[2].message.role).toBe("tool_result");
    expect(entries[3].message.role).toBe("assistant");
  });

  it("handles tool execution error gracefully", async () => {
    const crashTool = defineTool({
      name: "crash",
      description: "Always throws",
      inputSchema: z.object({}),
    }).server(async () => {
      throw new Error("boom");
    });

    const provider = mockProviderMultiTurn((request, callIndex) => {
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "crash" },
          { type: "tool_call", callId: "c1", name: "crash", args: {} },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Handled the error." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const events = await collectEvents(
      nessi({
        provider,
        systemPrompt: "test",
        store: memoryStore(),
        tools: [crashTool],
        input: "Crash",
      }),
    );

    const toolEnd = events.find((e) => e.type === "tool_end") as any;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain("boom");

    // Should still continue to next turn
    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("stop");
  });

  it("sets agentId on all events", async () => {
    const events = await collectEvents(
      nessi({
        agentId: "custom-agent",
        provider: mockProvider([
          { type: "text", delta: "Hello" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    for (const event of events) {
      expect((event as any).agentId).toBe("custom-agent");
    }
  });

  it("defaults agentId to 'main'", async () => {
    const events = await collectEvents(
      nessi({
        provider: mockProvider([
          { type: "text", delta: "Hello" },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    for (const event of events) {
      expect((event as any).agentId).toBe("main");
    }
  });

  it("provider error (non-retryable) → done with error", async () => {
    const events = await collectEvents(
      nessi({
        provider: mockProvider([{ type: "error", error: "API key invalid", retryable: false }]),
        systemPrompt: "test",
        store: memoryStore(),
        input: "Hi",
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("error");
  });

  it("provider error (retryable) still terminates turn without empty assistant message", async () => {
    const store = memoryStore();
    const events = await collectEvents(
      nessi({
        provider: mockProvider([{ type: "error", error: "Rate limited", retryable: true }]),
        systemPrompt: "test",
        store,
        input: "Hi",
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    expect(types).not.toContain("turn_end");
    const done = events.find((e) => e.type === "done") as any;
    expect(done.reason).toBe("error");

    const entries = await store.load();
    const assistantMessages = entries.filter((entry) => entry.message.role === "assistant");
    expect(assistantMessages).toHaveLength(0);
  });

  it("steer() injects message before next provider call", async () => {
    const requests: import("../src/types.js").ProviderRequest[] = [];
    const store = memoryStore();

    const provider = mockProviderMultiTurn((request, callIndex) => {
      requests.push(request);
      if (callIndex === 0) {
        return [
          { type: "tool_start", callId: "c1", name: "echo" },
          { type: "tool_call", callId: "c1", name: "echo", args: { text: "hi" } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Done." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store,
      tools: [echoTool],
      input: "Start",
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      // Steer after first tool completes
      if (event.type === "tool_end") {
        loop.steer("Focus on X");
      }
    }

    // steer_applied should be in the event stream
    const steerEvents = events.filter((e) => e.type === "steer_applied");
    expect(steerEvents).toHaveLength(1);
    expect((steerEvents[0] as any).message).toBe("Focus on X");

    // The second provider call should see the steer message
    expect(requests).toHaveLength(2);
    const secondMessages = requests[1].messages;
    const steerMsg = secondMessages.find(
      (m) => m.role === "user" && m.content.some((c: any) => c.text === "Focus on X"),
    );
    expect(steerMsg).toBeTruthy();
  });

  it("steer() resets turn counter", async () => {
    let callCount = 0;
    const provider = mockProviderMultiTurn((request, callIndex) => {
      callCount++;
      // Always return a tool call to keep looping
      if (callIndex < 3) {
        return [
          { type: "tool_start", callId: `c${callIndex}`, name: "echo" },
          { type: "tool_call", callId: `c${callIndex}`, name: "echo", args: { text: `${callIndex}` } },
          { type: "usage", usage: { input: 10, output: 5, total: 15 } },
        ];
      }
      return [
        { type: "text", delta: "Done." },
        { type: "usage", usage: { input: 20, output: 10, total: 30 } },
      ];
    });

    const loop = nessi({
      provider,
      systemPrompt: "test",
      store: memoryStore(),
      tools: [echoTool],
      input: "Go",
      maxTurns: 2,
    });

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
      // After first tool_end, steer to reset turns
      if (event.type === "tool_end" && (event as any).callId === "c0") {
        loop.steer("Keep going");
      }
    }

    // Without steer, maxTurns=2 would stop after 2 provider calls.
    // With steer resetting turn counter, we get more calls.
    expect(callCount).toBeGreaterThan(2);
  });

  it("steer() ignores empty strings", async () => {
    const loop = nessi({
      provider: mockProvider([
        { type: "text", delta: "Hello" },
        { type: "usage", usage: { input: 10, output: 5, total: 15 } },
      ]),
      systemPrompt: "test",
      store: memoryStore(),
      input: "Hi",
    });

    loop.steer("");
    loop.steer("   ");

    const events: OutboundEvent[] = [];
    for await (const event of loop) {
      events.push(event);
    }

    const steerEvents = events.filter((e) => e.type === "steer_applied");
    expect(steerEvents).toHaveLength(0);
  });
});
