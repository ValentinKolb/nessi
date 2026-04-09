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
    || lower.includes("context window");
};

export const normalizeHttpError = async (
  label: string,
  response: Response,
  retryableOverride?: boolean,
) => {
  const rawText = await response.text().catch(() => "");
  const { message, code } = parseErrorMessage(rawText);
  const fullMessage = code ? `${message} (code: ${code})` : message || `HTTP ${response.status}`;
  return {
    error: `${label} ${response.status}: ${fullMessage}`,
    retryable: retryableOverride ?? isRetryableStatus(response.status),
    contextOverflow: isContextOverflow(response.status, fullMessage),
  };
};

export const formatConnectionError = (label: string, error: unknown) =>
  `${label} connection failed: ${error instanceof Error ? error.message : String(error)}`;
