import { describe, it, expect } from "bun:test";
import { memoryStore } from "../src/stores.js";
import type { Message } from "../src/types.js";

const userMsg = (text: string): Message => ({
  role: "user",
  content: [{ type: "text", text }],
});

const assistantMsg = (text: string): Message => ({
  role: "assistant",
  content: [{ type: "text", text }],
});

describe("memoryStore", () => {
  it("starts empty", async () => {
    const store = memoryStore();
    const entries = await store.load();
    expect(entries).toEqual([]);
  });

  it("appends and loads messages", async () => {
    const store = memoryStore();
    await store.append(userMsg("hello"));
    await store.append(assistantMsg("hi"));

    const entries = await store.load();
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("message");
    expect(entries[0].seq).toBe(1);
    expect(entries[1].kind).toBe("message");
    expect(entries[1].seq).toBe(2);
  });

  it("auto-increments seq", async () => {
    const store = memoryStore();
    await store.append(userMsg("a"));
    await store.append(userMsg("b"));
    await store.append(userMsg("c"));

    const entries = await store.load();
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("respects explicit seq and kind", async () => {
    const store = memoryStore();
    await store.append(userMsg("a")); // seq 1
    await store.append(userMsg("b")); // seq 2
    await store.append(userMsg("summary of a"), { seq: 1, kind: "summary" });

    // load() returns from last summary onward.
    // Summary is at seq 1, message "b" is at seq 2.
    // The summary tiebreaker puts summary after message at same seq,
    // but load() returns starting from the summary entry.
    const entries = await store.load();
    // summary@1, then message@2
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("summary");
    expect(entries[0].seq).toBe(1);
    expect(entries[1].kind).toBe("message");
    expect(entries[1].seq).toBe(2);
  });

  it("load() returns entries from last summary onward", async () => {
    const store = memoryStore();
    await store.append(userMsg("msg-1")); // seq 1
    await store.append(assistantMsg("msg-2")); // seq 2
    await store.append(userMsg("msg-3")); // seq 3
    await store.append(assistantMsg("msg-4")); // seq 4
    await store.append(userMsg("msg-5")); // seq 5

    // Insert summary after seq 3
    await store.append(userMsg("Summary of msg-1 to msg-3"), { seq: 3, kind: "summary" });

    const entries = await store.load();
    // Should get: summary@3, msg-4@4, msg-5@5
    expect(entries).toHaveLength(3);
    expect(entries[0].kind).toBe("summary");
    expect(entries[0].seq).toBe(3);
    expect(entries[1].kind).toBe("message");
    expect(entries[1].seq).toBe(4);
    expect(entries[2].kind).toBe("message");
    expect(entries[2].seq).toBe(5);
  });

  it("summary tiebreaker: summary sorts after message at same seq", async () => {
    const store = memoryStore();
    await store.append(userMsg("original"), { seq: 5, kind: "message" });
    await store.append(userMsg("summary"), { seq: 5, kind: "summary" });

    const entries = await store.load();
    // load() returns from last summary onward
    // The summary at seq 5 is the last summary, so we get just that
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("summary");
  });

  it("load() without any summary returns all entries", async () => {
    const store = memoryStore();
    await store.append(userMsg("a"));
    await store.append(userMsg("b"));
    await store.append(userMsg("c"));

    const entries = await store.load();
    expect(entries).toHaveLength(3);
  });

  it("nextSeq stays ahead after explicit seq", async () => {
    const store = memoryStore();
    await store.append(userMsg("a")); // auto seq 1
    await store.append(userMsg("jump"), { seq: 100 }); // explicit seq 100
    await store.append(userMsg("b")); // should be seq 101

    const entries = await store.load();
    expect(entries.map((e) => e.seq)).toEqual([1, 100, 101]);
  });
});
