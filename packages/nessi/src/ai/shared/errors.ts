import { safeJsonParse } from "./json.js";

const parseErrorMessage = (rawText: string) => {
  const parsed = safeJsonParse<Record<string, unknown>>(rawText);
  if (!parsed) return { message: rawText };

  const nestedError = parsed.error as Record<string, unknown> | undefined;
  const message =
    (typeof nestedError?.message === "string" && nestedError.message) ||
    (typeof parsed.message === "string" && parsed.message) ||
    rawText;
  const code =
    (typeof nestedError?.code === "string" && nestedError.code) ||
    (typeof parsed.code === "string" && parsed.code) ||
    undefined;

  return { message, code };
};

export const isRetryableStatus = (status: number) =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

export const isContextOverflow = (status: number, message: string) => {
  if (status !== 400 && status !== 413 && status !== 422) return false;
  const lower = message.toLowerCase();
  return lower.includes("context")
    || lower.includes("too long")
    || lower.includes("maximum")
    || lower.includes("max tokens")
    || lower.includes("context window")
    || lower.includes("token limit")
    || lower.includes("prompt is too long")
    || lower.includes("reduce the length")
    || lower.includes("exceeded");
};

/**
 * Try to extract an overflow ratio from a provider error message.
 * Many providers include token counts like:
 * "maximum context length is 32768 tokens ... your prompt contains 45000 tokens"
 */
export const parseOverflowRatio = (message: string): number | undefined => {
  const maxMatch = message.match(
    /(?:maximum|max)\s+(?:context\s+)?(?:length|window|limit)\s+(?:is|of)\s+([\d,]+)/i,
  );
  const actualMatch = message.match(
    /(?:resulted?\s+in|contains?\s+(?:at\s+least\s+)?|received|totale?\s+of\s+(?:at\s+least\s+)?)\s*([\d,]+)\s*(?:tokens|input)/i,
  );
  if (!maxMatch?.[1] || !actualMatch?.[1]) return undefined;
  const max = parseInt(maxMatch[1].replace(/,/g, ""), 10);
  const actual = parseInt(actualMatch[1].replace(/,/g, ""), 10);
  return max > 0 ? actual / max : undefined;
};

export const normalizeHttpError = async (
  label: string,
  response: Response,
  retryableOverride?: boolean,
) => {
  const rawText = await response.text().catch(() => "");
  const { message, code } = parseErrorMessage(rawText);
  const fullMessage = code ? `${message} (code: ${code})` : message || `HTTP ${response.status}`;
  const contextOverflow = isContextOverflow(response.status, fullMessage);
  return {
    error: `${label} ${response.status}: ${fullMessage}`,
    retryable: retryableOverride ?? isRetryableStatus(response.status),
    contextOverflow,
    overflowRatio: contextOverflow ? parseOverflowRatio(fullMessage) : undefined,
  };
};

export const formatConnectionError = (label: string, error: unknown) =>
  `${label} connection failed: ${error instanceof Error ? error.message : String(error)}`;
