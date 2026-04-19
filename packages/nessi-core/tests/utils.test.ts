import { describe, it, expect } from "bun:test";
import { estimateTokens, zeroUsage, toErrorMessage } from "../src/utils.js";

describe("estimateTokens", () => {
  it("estimates roughly 1 token per 4 chars", () => {
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "a".repeat(400) }] },
    ];
    const tokens = estimateTokens(messages);
    // JSON wrapping adds some overhead, but should be in the right ballpark
    expect(tokens).toBeGreaterThan(90);
    expect(tokens).toBeLessThan(200);
  });

  it("returns higher estimate for more messages", () => {
    const small = [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }];
    const large = [
      { role: "user" as const, content: [{ type: "text" as const, text: "hello world ".repeat(100) }] },
      { role: "assistant" as const, content: [{ type: "text" as const, text: "response ".repeat(100) }] },
    ];
    expect(estimateTokens(large)).toBeGreaterThan(estimateTokens(small));
  });

  it("handles empty message list", () => {
    expect(estimateTokens([])).toBe(1); // Math.ceil("[]".length / 4)
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
