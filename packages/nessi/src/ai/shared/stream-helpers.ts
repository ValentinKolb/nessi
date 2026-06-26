import { formatConnectionError, normalizeHttpError } from "./errors.js";
import { parseSSE } from "./sse.js";
import type { SSEEvent } from "./sse.js";
import type { StreamEvent } from "../types.js";

type SSEStreamResult =
  | { ok: true; events: AsyncGenerator<SSEEvent> }
  | { ok: false; error: StreamEvent & { type: "error" } };

export const openSSEStream = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  label: string,
  signal?: AbortSignal,
  contextWindow?: number,
): Promise<SSEStreamResult> => {
  const serializedBody = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: serializedBody,
      signal,
    });
  } catch (error) {
    // Heuristic: if the request body is large relative to the context window,
    // a network error likely means the server rejected it for context overflow
    // (browsers hide the actual HTTP 400 body behind CORS on error responses).
    const estimatedTokens = serializedBody.length / 4;
    const isLikelyOverflow = typeof contextWindow === "number"
      && contextWindow > 0
      && estimatedTokens > contextWindow * 0.85;
    if (isLikelyOverflow) {
      const ratio = estimatedTokens / contextWindow;
      return {
        ok: false,
        error: {
          type: "error",
          error: `${label}: context window likely exceeded (~${Math.round(estimatedTokens)} tokens estimated, limit ${contextWindow})`,
          retryable: false,
          contextOverflow: true,
          overflowRatio: ratio,
        },
      };
    }
    return {
      ok: false,
      error: { type: "error", error: formatConnectionError(label, error), retryable: true },
    };
  }

  if (!response.ok) {
    const normalized = await normalizeHttpError(label, response);
    return { ok: false, error: { type: "error", ...normalized } };
  }

  const reader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) {
    return {
      ok: false,
      error: { type: "error", error: `${label} response body missing`, retryable: false },
    };
  }

  return { ok: true, events: parseSSE(reader) };
};
