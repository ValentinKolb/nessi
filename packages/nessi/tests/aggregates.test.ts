import { describe, expect, it } from "bun:test";
import { cloneLoopAggregate, mergeLoopAggregates, mergeUsage } from "../src/index.js";
import type { LoopAggregate } from "../src/types.js";

describe("loop aggregate helpers", () => {
  it("merges usage and preserves optional counters", () => {
    expect(
      mergeUsage(
        { input: 10, output: 5, total: 15, cacheRead: 2 },
        { input: 20, output: 7, total: 27, creditsUsed: 1.5 },
      ),
    ).toEqual({
      input: 30,
      output: 12,
      total: 42,
      cacheRead: 2,
      creditsUsed: 1.5,
    });
    expect(mergeUsage(undefined, undefined)).toBeUndefined();
  });

  it("clones loop aggregates without sharing mutable arrays", () => {
    const aggregate: LoopAggregate = {
      turns: [
        {
          message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
          usage: { input: 1, output: 2, total: 3 },
          stopReason: "stop",
          toolCalls: [{ callId: "c1", name: "echo", args: { text: "hello" }, result: "hello" }],
        },
      ],
      usage: { input: 1, output: 2, total: 3 },
      toolCallCount: 1,
      toolErrorCount: 0,
      toolIssueCount: 1,
      toolMalformedCount: 1,
      toolCancelledCount: 0,
      toolIssues: [
        {
          kind: "malformed",
          reason: "text_during_tool_call",
          message: "bad stream",
          callId: "c2",
          name: "card",
        },
      ],
      assistantMessageCount: 1,
    };

    const clone = cloneLoopAggregate(aggregate);
    expect(clone).toEqual(aggregate);

    clone.turns[0]!.toolCalls[0]!.result = "changed";
    clone.toolIssues[0]!.message = "changed";

    expect(aggregate.turns[0]!.toolCalls[0]!.result).toBe("hello");
    expect(aggregate.toolIssues[0]!.message).toBe("bad stream");
  });

  it("clones legacy loop aggregates without tool issue fields", () => {
    const legacyAggregate = {
      turns: [
        {
          message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
          usage: { input: 1, output: 2, total: 3 },
          stopReason: "stop",
          toolCalls: [],
        },
      ],
      usage: { input: 1, output: 2, total: 3 },
      toolCallCount: 0,
      toolErrorCount: 0,
      assistantMessageCount: 1,
    } as LoopAggregate;

    const clone = cloneLoopAggregate(legacyAggregate);

    expect(clone.toolIssueCount).toBe(0);
    expect(clone.toolMalformedCount).toBe(0);
    expect(clone.toolCancelledCount).toBe(0);
    expect(clone.toolIssues).toEqual([]);
  });

  it("merges loop aggregates from their turns", () => {
    const first: LoopAggregate = {
      turns: [
        {
          message: { role: "assistant", content: [{ type: "text", text: "first" }] },
          usage: { input: 10, output: 5, total: 15, cacheRead: 3 },
          stopReason: "tool_use",
          toolCalls: [{ callId: "c1", name: "echo", args: { text: "first" }, result: "first" }],
        },
      ],
      usage: { input: 10, output: 5, total: 15, cacheRead: 3 },
      toolCallCount: 1,
      toolErrorCount: 0,
      toolIssueCount: 0,
      toolMalformedCount: 0,
      toolCancelledCount: 0,
      toolIssues: [],
      assistantMessageCount: 1,
    };
    const second: LoopAggregate = {
      turns: [
        {
          message: { role: "assistant", content: [{ type: "text", text: "second" }] },
          usage: { input: 20, output: 6, total: 26, creditsUsed: 2 },
          stopReason: "stop",
          toolCalls: [{ callId: "c2", name: "lookup", args: {}, result: "boom", isError: true }],
        },
      ],
      usage: { input: 20, output: 6, total: 26, creditsUsed: 2 },
      toolCallCount: 1,
      toolErrorCount: 1,
      toolIssueCount: 1,
      toolMalformedCount: 0,
      toolCancelledCount: 1,
      toolIssues: [
        {
          kind: "cancelled",
          reason: "stream_ended_before_tool_call",
          message: "stream ended",
          callId: "c3",
          name: "lookup",
        },
      ],
      assistantMessageCount: 1,
    };

    const merged = mergeLoopAggregates(first, second);

    expect(merged?.assistantMessageCount).toBe(2);
    expect(merged?.toolCallCount).toBe(2);
    expect(merged?.toolErrorCount).toBe(1);
    expect(merged?.toolIssueCount).toBe(1);
    expect(merged?.toolCancelledCount).toBe(1);
    expect(merged?.usage).toEqual({
      input: 30,
      output: 11,
      total: 41,
      cacheRead: 3,
      creditsUsed: 2,
    });
  });
});
