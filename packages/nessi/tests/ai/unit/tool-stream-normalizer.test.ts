import { describe, expect, it } from "bun:test";
import { normalizeToolStream } from "../../../src/ai/shared/tool-stream-normalizer.js";
import type { StreamEvent } from "../../../src/ai/types.js";

async function collect(events: StreamEvent[]): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  async function* source() {
    for (const event of events) yield event;
  }
  for await (const event of normalizeToolStream(source(), { suppressTextAfterMalformedTool: true })) {
    out.push(event);
  }
  return out;
}

describe("normalizeToolStream", () => {
  it("passes valid streamed tool calls through", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "search" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"q\":\"x\"}" },
      { type: "tool_call", callId: "c1", name: "search", args: { q: "x" } },
    ]);

    expect(events.map((event) => event.type)).toEqual(["tool_start", "tool_delta", "tool_call"]);
  });

  it("marks pending tool calls malformed when text arrives", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "card" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"title\":\"Hi\"" },
      { type: "text", delta: "</invoke>" },
      { type: "text", delta: "</think>" },
      { type: "tool_call", callId: "c1", name: "card", args: {} },
      { type: "usage", usage: { input: 1, output: 2, total: 3 }, finishReason: "stop" },
    ]);

    expect(events.map((event) => event.type)).toEqual(["tool_error", "usage"]);
    const issue = events.find((event) => event.type === "tool_error") as Extract<StreamEvent, { type: "tool_error" }>;
    expect(issue.reason).toBe("text_during_tool_call");
    expect(issue.textDelta).toBe("</invoke>");
    expect(events.some((event) => event.type === "tool_call")).toBe(false);
    expect(events.some((event) => event.type === "text")).toBe(false);
  });

  it("does not turn malformed argument JSON into an executable tool call", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "card" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"title\":\"Hi\"" },
      { type: "tool_call", callId: "c1", name: "card", args: {} },
    ]);

    expect(events.map((event) => event.type)).toEqual(["tool_error"]);
    const issue = events.find((event) => event.type === "tool_error") as Extract<StreamEvent, { type: "tool_error" }>;
    expect(issue.reason).toBe("invalid_tool_arguments");
  });

  it("cancels pending tool calls when the stream ends", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "search" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"q\":" },
    ]);

    expect(events.map((event) => event.type)).toEqual(["tool_cancel"]);
    const cancel = events.find((event) => event.type === "tool_cancel") as Extract<StreamEvent, { type: "tool_cancel" }>;
    expect(cancel.reason).toBe("stream_ended_before_tool_call");
  });

  it("downgrades tool_use finish reason when malformed calls suppressed all executable tools", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "card" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"title\":\"Hi\"" },
      { type: "text", delta: "</invoke>" },
      { type: "usage", usage: { input: 1, output: 2, total: 3 }, finishReason: "tool_use" },
    ]);

    const usage = events.find((event) => event.type === "usage") as Extract<StreamEvent, { type: "usage" }>;
    expect(usage.finishReason).toBe("stop");
  });

  it("cancels pending tool calls before provider errors", async () => {
    const events = await collect([
      { type: "tool_start", callId: "c1", name: "search" },
      { type: "tool_delta", callId: "c1", argsDelta: "{\"q\":\"x\"" },
      { type: "error", error: "network", retryable: true },
    ]);

    expect(events.map((event) => event.type)).toEqual(["tool_cancel", "error"]);
    const cancel = events.find((event) => event.type === "tool_cancel") as Extract<StreamEvent, { type: "tool_cancel" }>;
    expect(cancel.reason).toBe("provider_error_before_tool_call");
  });
});
