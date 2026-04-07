import { describe, expect, it } from "bun:test";
import { assertOnlySupportedFiles, contentPartToText } from "../../src/shared/messages.js";

describe("message helpers", () => {
  it("converts text parts to text", () => {
    expect(contentPartToText("hello")).toBe("hello");
    expect(contentPartToText({ type: "text", text: "world" })).toBe("world");
  });

  it("rejects unsupported file parts", () => {
    expect(() =>
      assertOnlySupportedFiles([{ type: "file", data: "abc", mediaType: "application/pdf" }], false, "test"),
    ).toThrow("does not support input file type");
  });
});
