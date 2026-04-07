// ============================================================================
// Mock Provider for deterministic testing
// ============================================================================

import { completeFromStream } from "nessi-ai";
import type { Provider, ProviderEvent, ProviderRequest } from "../src/types.js";

/**
 * Creates a provider that yields a predetermined sequence of events.
 * Optionally accepts a callback to inspect the request.
 */
export function mockProvider(
  events: ProviderEvent[],
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
    },
    contextWindow: options?.contextWindow ?? 100_000,
    async *stream(request: ProviderRequest) {
      options?.onRequest?.(request);
      for (const event of events) {
        yield event;
      }
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
  factory: (request: ProviderRequest, callIndex: number) => ProviderEvent[],
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
    },
    contextWindow: options?.contextWindow ?? 100_000,
    async *stream(request: ProviderRequest) {
      const events = factory(request, callIndex++);
      for (const event of events) {
        yield event;
      }
    },
    complete(request: ProviderRequest) {
      return completeFromStream(provider, request);
    },
  };
  return provider;
}
