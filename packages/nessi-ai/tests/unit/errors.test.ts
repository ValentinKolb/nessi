import { describe, it, expect } from "bun:test";
import { isContextOverflow, parseOverflowRatio } from "../../src/shared/errors.js";

describe("isContextOverflow", () => {
  const overflow = (status: number, msg: string) => isContextOverflow(status, msg);

  it("detects common context overflow messages", () => {
    expect(overflow(400, "context length exceeded")).toBe(true);
    expect(overflow(400, "input is too long")).toBe(true);
    expect(overflow(400, "maximum context length is 32768")).toBe(true);
    expect(overflow(400, "max tokens exceeded")).toBe(true);
    expect(overflow(400, "context window exceeded")).toBe(true);
    expect(overflow(400, "token limit reached")).toBe(true);
    expect(overflow(400, "prompt is too long")).toBe(true);
    expect(overflow(400, "reduce the length of the input")).toBe(true);
    expect(overflow(400, "limit exceeded")).toBe(true);
  });

  it("detects on status 413 and 422", () => {
    expect(overflow(413, "context too long")).toBe(true);
    expect(overflow(422, "token limit exceeded")).toBe(true);
  });

  it("rejects non-overflow status codes", () => {
    expect(overflow(200, "context too long")).toBe(false);
    expect(overflow(401, "context too long")).toBe(false);
    expect(overflow(500, "context too long")).toBe(false);
  });

  it("rejects unrelated 400 errors", () => {
    expect(overflow(400, "invalid api key")).toBe(false);
    expect(overflow(400, "model not found")).toBe(false);
  });
});

describe("parseOverflowRatio", () => {
  it("parses vLLM-style error message", () => {
    const msg =
      "This model's maximum context length is 32768 tokens. However, you requested 0 output tokens and your prompt contains at least 32769 input tokens, for a total of at least 32769 tokens.";
    const ratio = parseOverflowRatio(msg);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeCloseTo(32769 / 32768, 2);
  });

  it("parses OpenAI-style error message", () => {
    const msg =
      "This model's maximum context length is 4096 tokens. However, your messages resulted in 5120 tokens.";
    const ratio = parseOverflowRatio(msg);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeCloseTo(5120 / 4096, 2);
  });

  it("returns undefined for non-overflow messages", () => {
    expect(parseOverflowRatio("invalid api key")).toBeUndefined();
    expect(parseOverflowRatio("model not found")).toBeUndefined();
    expect(parseOverflowRatio("")).toBeUndefined();
  });

  it("returns undefined when only max is present", () => {
    expect(parseOverflowRatio("maximum context length is 32768 tokens")).toBeUndefined();
  });
});
