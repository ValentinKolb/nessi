import { describe, it, expect } from "bun:test";
import { estimateTokens, zeroUsage, toErrorMessage, truncateMiddle, truncateMessages } from "../src/utils.js";
import type { Message } from "../src/types.js";

describe("estimateTokens", () => {
  it("estimates roughly 1 token per 4 chars", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "a".repeat(400) }] },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(90);
    expect(tokens).toBeLessThan(200);
  });

  it("returns higher estimate for more messages", () => {
    const small: Message[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    const large: Message[] = [
      { role: "user", content: [{ type: "text", text: "hello world ".repeat(100) }] },
      { role: "assistant", content: [{ type: "text", text: "response ".repeat(100) }] },
    ];
    expect(estimateTokens(large)).toBeGreaterThan(estimateTokens(small));
  });

  it("handles empty message list", () => {
    expect(estimateTokens([])).toBe(1);
  });
});

describe("truncateMiddle", () => {
  it("returns short text unchanged", () => {
    expect(truncateMiddle("hello", 100)).toBe("hello");
  });

  it("truncates long text keeping first and last half", () => {
    const text = "a".repeat(50) + "b".repeat(50);
    const result = truncateMiddle(text, 20);
    expect(result).toContain("a".repeat(10));
    expect(result).toContain("b".repeat(10));
    expect(result).toContain("80 characters omitted");
  });

  it("returns text unchanged at exact limit", () => {
    const text = "x".repeat(100);
    expect(truncateMiddle(text, 100)).toBe(text);
  });
});

describe("truncateMessages", () => {
  it("strips thinking blocks from assistant messages", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "answer" },
          { type: "thinking", thinking: "let me think..." },
          { type: "tool_call", id: "c1", name: "test", args: {} },
        ],
      },
    ];
    const result = truncateMessages(messages);
    const assistant = result[0];
    expect(assistant.role).toBe("assistant");
    if (assistant.role === "assistant") {
      expect(assistant.content).toHaveLength(2);
      expect(assistant.content[0].type).toBe("text");
      expect(assistant.content[1].type).toBe("tool_call");
    }
  });

  it("does not modify assistant messages without thinking", () => {
    const messages: Message[] = [
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ];
    const result = truncateMessages(messages);
    expect(result[0]).toBe(messages[0]); // same reference
  });

  it("truncates long tool results", () => {
    const messages: Message[] = [
      { role: "tool_result", callId: "c1", name: "test", result: "x".repeat(5000) },
    ];
    const result = truncateMessages(messages, 100);
    const tool = result[0];
    expect(tool.role).toBe("tool_result");
    if (tool.role === "tool_result") {
      expect(typeof tool.result).toBe("string");
      expect((tool.result as string).length).toBeLessThan(200); // 100 + omission notice
      expect((tool.result as string)).toContain("characters omitted");
    }
  });

  it("does not truncate short tool results", () => {
    const messages: Message[] = [
      { role: "tool_result", callId: "c1", name: "test", result: "short" },
    ];
    const result = truncateMessages(messages, 100);
    expect(result[0]).toBe(messages[0]); // same reference
  });

  it("does not truncate tool results when maxToolResultChars is undefined", () => {
    const messages: Message[] = [
      { role: "tool_result", callId: "c1", name: "test", result: "x".repeat(5000) },
    ];
    const result = truncateMessages(messages);
    expect(result[0]).toBe(messages[0]); // same reference
  });

  it("handles object tool results", () => {
    const messages: Message[] = [
      { role: "tool_result", callId: "c1", name: "test", result: { data: "x".repeat(5000) } },
    ];
    const result = truncateMessages(messages, 100);
    const tool = result[0];
    if (tool.role === "tool_result") {
      expect(typeof tool.result).toBe("string");
      expect((tool.result as string)).toContain("characters omitted");
    }
  });

  it("leaves user messages untouched", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "x".repeat(5000) }] },
    ];
    const result = truncateMessages(messages, 100);
    expect(result[0]).toBe(messages[0]);
  });
});

describe("zeroUsage", () => {
  it("returns zero usage", () => {
    const usage = zeroUsage();
    expect(usage.input).toBe(0);
    expect(usage.output).toBe(0);
    expect(usage.total).toBe(0);
  });
});

describe("toErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(toErrorMessage("oops")).toBe("oops");
    expect(toErrorMessage(42)).toBe("42");
  });
});
