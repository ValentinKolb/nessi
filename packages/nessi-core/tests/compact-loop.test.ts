import { describe, it, expect } from "bun:test";
import { compact } from "../src/compact.js";
import { memoryStore } from "../src/stores.js";
import { mockProvider } from "./mock-provider.js";
import type { CompactEvent, Message } from "../src/types.js";

const provider = mockProvider([]);

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

async function collectEvents(loop: ReturnType<typeof compact>): Promise<CompactEvent[]> {
  const events: CompactEvent[] = [];
  for await (const event of loop) {
    events.push(event);
  }
  return events;
}

describe("compact loop", () => {
  it("returns done(stop) when compact function skips", async () => {
    const store = memoryStore();
    await store.append(userMessage("a"));
    await store.append(userMessage("b"));

    const events = await collectEvents(compact({
      store,
      provider,
      compact: () => null,
    }));

    expect(events).toHaveLength(1);
    const done = events[0];
    expect(done.type).toBe("done");
    if (done.type !== "done") return;
    expect(done.reason).toBe("stop");
    expect(done.result.applied).toBe(false);
    expect(done.result.entriesBefore).toBe(2);
    expect(done.result.entriesAfter).toBe(2);
  });

  it("emits compaction start/end and done on success", async () => {
    const store = memoryStore();
    await store.append(userMessage("1"));
    await store.append(userMessage("2"));
    await store.append(userMessage("3"));

    const events = await collectEvents(compact({
      store,
      provider,
      compact: (ctx) => {
        return ctx.store.append(userMessage("summary"), { seq: 2, kind: "summary" });
      },
    }));

    expect(events.map((e) => e.type)).toEqual(["compaction_start", "compaction_end", "done"]);
    const done = events[2];
    if (done.type !== "done") return;
    expect(done.reason).toBe("stop");
    expect(done.result.applied).toBe(true);
    expect(done.result.entriesBefore).toBe(3);
    expect(done.result.entriesAfter).toBe(2);
  });

  it("emits error and done(error) when compact throws", async () => {
    const store = memoryStore();
    await store.append(userMessage("x"));

    const events = await collectEvents(compact({
      store,
      provider,
      compact: () => {
        throw new Error("boom");
      },
    }));

    expect(events.map((e) => e.type)).toEqual(["error", "done"]);
    const err = events[0];
    expect(err.type).toBe("error");
    if (err.type !== "error") return;
    expect(err.error).toContain("boom");

    const done = events[1];
    if (done.type !== "done") return;
    expect(done.reason).toBe("error");
    expect(done.result.applied).toBe(false);
  });

  it("returns done(aborted) when signal is already aborted", async () => {
    const store = memoryStore();
    await store.append(userMessage("x"));

    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(compact({
      store,
      provider,
      compact: () => null,
      signal: controller.signal,
    }));

    expect(events).toHaveLength(1);
    const done = events[0];
    if (done.type !== "done") return;
    expect(done.reason).toBe("aborted");
    expect(done.result.applied).toBe(false);
  });

  it("delivers same event order to subscribe() and iterator", async () => {
    const store = memoryStore();
    await store.append(userMessage("1"));
    await store.append(userMessage("2"));
    await store.append(userMessage("3"));

    const loop = compact({
      store,
      provider,
      compact: (ctx) => ctx.store.append(userMessage("summary"), { seq: 2, kind: "summary" }),
    });

    const subscribed: CompactEvent[] = [];
    const unsub = loop.subscribe((event) => subscribed.push(event));

    const iterated: CompactEvent[] = [];
    for await (const event of loop) {
      iterated.push(event);
    }
    unsub();

    expect(subscribed.map((e) => e.type)).toEqual(iterated.map((e) => e.type));
  });
});
