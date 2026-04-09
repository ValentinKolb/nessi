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
): Promise<SSEStreamResult> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
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
