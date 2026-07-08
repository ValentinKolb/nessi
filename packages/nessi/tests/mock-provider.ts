// ============================================================================
// Mock Provider for deterministic testing
// ============================================================================

import { completeFromStream } from "../src/ai/index.js";
import { normalizeProviderStream } from "../src/ai/shared/tool-stream-normalizer.js";
import type { RawStreamEvent } from "../src/ai/types.js";
import type { Provider, ProviderEvent, ProviderRequest } from "../src/types.js";

type MockProviderEvent = ProviderEvent | RawStreamEvent;

const rawTypes = new Set([
  "text",
  "thinking",
  "tool_start",
  "tool_delta",
  "tool_call",
  "tool_error",
  "tool_cancel",
  "error",
]);

const isRawEvent = (event: MockProviderEvent): event is RawStreamEvent => rawTypes.has(event.type);

async function* source<T>(events: T[]): AsyncIterable<T> {
  for (const event of events) yield event;
}

const streamMockEvents = (events: MockProviderEvent[]): AsyncIterable<ProviderEvent> => {
  if (events.some(isRawEvent)) return normalizeProviderStream(source(events as RawStreamEvent[]), {
    suppressTextAfterMalformedTool: true,
  });
  return source(events as ProviderEvent[]);
}

/**
 * Creates a provider that yields a predetermined sequence of events.
 * Optionally accepts a callback to inspect the request.
 */
export function mockProvider(
  events: MockProviderEvent[],
  options?: {
    contextWindow?: number;
    name?: string;
    onRequest?: (request: ProviderRequest) => void;
  },
): Provider {
  const provider: Provider = {
    name: options?.name ?? "mock",
    family: "openai-compatible",
    model: options?.name ?? "mock",
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: true,
      usage: true,
      structuredOutput: true,
    },
    contextWindow: options?.contextWindow ?? 100_000,
    async *stream(request: ProviderRequest) {
      options?.onRequest?.(request);
      yield* streamMockEvents(events);
    },
    complete(request: ProviderRequest) {
      return completeFromStream(provider, request);
    },
  };
  return provider;
}

/**
 * Creates a provider that calls a factory function each time stream() is called.
 * Useful for multi-turn tests where different turns need different responses.
 */
export function mockProviderMultiTurn(
  factory: (request: ProviderRequest, callIndex: number) => MockProviderEvent[],
  options?: { contextWindow?: number; name?: string },
): Provider {
  let callIndex = 0;
  const provider: Provider = {
    name: options?.name ?? "mock",
    family: "openai-compatible",
    model: options?.name ?? "mock",
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: true,
      usage: true,
      structuredOutput: true,
    },
    contextWindow: options?.contextWindow ?? 100_000,
    async *stream(request: ProviderRequest) {
      const events = factory(request, callIndex++);
      yield* streamMockEvents(events);
    },
    complete(request: ProviderRequest) {
      return completeFromStream(provider, request);
    },
  };
  return provider;
}
