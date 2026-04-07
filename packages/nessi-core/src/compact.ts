import type {
  CompactEvent,
  CompactLoop,
  CompactOptions,
  CompactResult,
  Usage,
} from "./types.js";

function zeroUsage(): Usage {
  return { input: 0, output: 0, total: 0 };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Run compaction as a loop-style operation so consumers can iterate or subscribe to events.
 */
export function compact(options: CompactOptions): CompactLoop {
  const {
    agentId = "main",
    store,
    provider,
    compact: compactFn,
    usage = zeroUsage(),
    force = true,
    signal: externalSignal,
  } = options;

  const subscribers: Array<(event: CompactEvent) => void> = [];
  const abortController = new AbortController();

  if (externalSignal) {
    if (externalSignal.aborted) abortController.abort();
    else externalSignal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  const signal = abortController.signal;

  async function* run(): AsyncGenerator<CompactEvent> {
    let entriesBefore = 0;

    try {
      entriesBefore = (await store.load()).length;

      if (signal.aborted) {
        const abortedResult: CompactResult = {
          applied: false,
          entriesBefore,
          entriesAfter: entriesBefore,
          forced: force,
        };
        yield { type: "done", agentId, reason: "aborted", result: abortedResult };
        return;
      }

      const entries = await store.load();
      const operation = compactFn({
        entries,
        store,
        provider,
        usage,
        force,
      });

      if (!operation) {
        const skippedResult: CompactResult = {
          applied: false,
          entriesBefore,
          entriesAfter: entriesBefore,
          forced: force,
        };
        yield { type: "done", agentId, reason: "stop", result: skippedResult };
        return;
      }

      yield { type: "compaction_start", agentId };
      await operation;
      yield { type: "compaction_end", agentId };

      const entriesAfter = (await store.load()).length;
      const successResult: CompactResult = {
        applied: true,
        entriesBefore,
        entriesAfter,
        forced: force,
      };
      yield {
        type: "done",
        agentId,
        reason: signal.aborted ? "aborted" : "stop",
        result: successResult,
      };
    } catch (err) {
      const message = toErrorMessage(err);
      const entriesAfter = (await store.load().then((entries) => entries.length).catch(() => entriesBefore));
      const failedResult: CompactResult = {
        applied: false,
        entriesBefore,
        entriesAfter,
        forced: force,
      };
      yield { type: "error", agentId, error: message, retryable: false };
      yield { type: "done", agentId, reason: signal.aborted ? "aborted" : "error", result: failedResult };
    }
  }

  const generator = run();

  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          const result = await generator.next();
          if (!result.done && result.value) {
            for (const subscriber of subscribers) subscriber(result.value);
          }
          return result;
        },
        async return(value?: CompactEvent) {
          return generator.return(value as CompactEvent);
        },
        async throw(err?: unknown) {
          return generator.throw(err);
        },
      };
    },
    subscribe(listener: (event: CompactEvent) => void) {
      subscribers.push(listener);
      return () => {
        const idx = subscribers.indexOf(listener);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
    abort() {
      abortController.abort();
    },
  };
}
