import { safeJsonParse } from "./json.js";
import type { StreamEvent, ToolStreamIssueReason } from "../types.js";

type PendingToolCall = {
  callId: string;
  name: string;
  argsText: string;
  argsDeltas: string[];
};

type NormalizerOptions = {
  suppressTextAfterMalformedTool?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseArgsText = (argsText: string) => {
  const trimmed = argsText.trim();
  if (!trimmed) return { ok: true as const };
  return isRecord(safeJsonParse(trimmed))
    ? { ok: true as const }
    : { ok: false as const };
};

const issueMessage = (reason: ToolStreamIssueReason, tool: PendingToolCall | undefined) => {
  const label = tool?.name ? `"${tool.name}"` : "unknown tool";
  switch (reason) {
    case "text_during_tool_call":
      return `Received text while a tool call for ${label} was still open.`;
    case "thinking_during_tool_call":
      return `Received thinking text while a tool call for ${label} was still open.`;
    case "tool_delta_without_start":
      return "Received a tool argument delta before a matching tool_start event.";
    case "missing_tool_name":
      return "Received a tool call without a usable tool name.";
    case "invalid_tool_arguments":
      return `Received malformed JSON arguments for ${label}.`;
    case "stream_ended_before_tool_call":
      return `The stream ended before a pending tool call for ${label} became executable.`;
    case "provider_error_before_tool_call":
      return `The provider errored before a pending tool call for ${label} became executable.`;
  }
};

function toolError(
  pending: PendingToolCall | undefined,
  reason: ToolStreamIssueReason,
  extra?: { textDelta?: string },
): StreamEvent {
  return {
    type: "tool_error",
    callId: pending?.callId,
    name: pending?.name,
    reason,
    message: issueMessage(reason, pending),
    argsText: pending?.argsText,
    textDelta: extra?.textDelta,
  };
}

function toolCancel(pending: PendingToolCall, reason: ToolStreamIssueReason): StreamEvent {
  return {
    type: "tool_cancel",
    callId: pending.callId,
    name: pending.name,
    reason,
    message: issueMessage(reason, pending),
    argsText: pending.argsText,
  };
}

export async function* normalizeToolStream(
  events: AsyncIterable<StreamEvent>,
  options: NormalizerOptions = {},
): AsyncIterable<StreamEvent> {
  const pending = new Map<string, PendingToolCall>();
  const malformedCallIds = new Set<string>();
  let emittedToolCallCount = 0;
  let toolIssueCount = 0;
  let suppressMalformedTextSpan = false;

  const malformedPending = function* (
    reason: "text_during_tool_call" | "thinking_during_tool_call",
    textDelta: string,
  ): Generator<StreamEvent> {
    for (const tool of pending.values()) {
      malformedCallIds.add(tool.callId);
      toolIssueCount++;
      yield toolError(tool, reason, { textDelta });
    }
    pending.clear();
    if (options.suppressTextAfterMalformedTool) suppressMalformedTextSpan = true;
  };

  for await (const event of events) {
    switch (event.type) {
      case "text":
        if (pending.size > 0) {
          yield* malformedPending("text_during_tool_call", event.delta);
          if (options.suppressTextAfterMalformedTool) break;
        }
        if (suppressMalformedTextSpan) break;
        yield event;
        break;

      case "thinking":
        if (pending.size > 0) {
          yield* malformedPending("thinking_during_tool_call", event.delta);
          if (options.suppressTextAfterMalformedTool) break;
        }
        if (suppressMalformedTextSpan) break;
        yield event;
        break;

      case "tool_start":
        suppressMalformedTextSpan = false;
        pending.set(event.callId, { callId: event.callId, name: event.name, argsText: "", argsDeltas: [] });
        break;

      case "tool_delta": {
        if (malformedCallIds.has(event.callId)) break;
        const tool = pending.get(event.callId);
        if (!tool) {
          toolIssueCount++;
          yield toolError(undefined, "tool_delta_without_start", { textDelta: event.argsDelta });
          break;
        }
        tool.argsText += event.argsDelta;
        tool.argsDeltas.push(event.argsDelta);
        break;
      }

      case "tool_call": {
        suppressMalformedTextSpan = false;
        const tool = pending.get(event.callId);
        if (malformedCallIds.has(event.callId)) {
          malformedCallIds.delete(event.callId);
          pending.delete(event.callId);
          break;
        }

        if (!event.name.trim()) {
          malformedCallIds.add(event.callId);
          pending.delete(event.callId);
          toolIssueCount++;
          yield toolError(
            tool ?? { callId: event.callId, name: event.name, argsText: "", argsDeltas: [] },
            "missing_tool_name",
          );
          break;
        }

        if (tool && !parseArgsText(tool.argsText).ok) {
          malformedCallIds.add(event.callId);
          pending.delete(event.callId);
          toolIssueCount++;
          yield toolError(tool, "invalid_tool_arguments");
          break;
        }

        pending.delete(event.callId);
        if (tool) {
          const name = event.name || tool.name;
          yield { type: "tool_start", callId: event.callId, name };
          for (const argsDelta of tool.argsDeltas) {
            yield { type: "tool_delta", callId: event.callId, argsDelta };
          }
        }
        emittedToolCallCount++;
        yield event;
        break;
      }

      case "tool_error":
      case "tool_cancel":
        suppressMalformedTextSpan = false;
        if (event.callId) pending.delete(event.callId);
        toolIssueCount++;
        yield event;
        break;

      case "usage":
        suppressMalformedTextSpan = false;
        if (event.finishReason && pending.size > 0) {
          for (const tool of pending.values()) {
            toolIssueCount++;
            yield toolCancel(tool, "stream_ended_before_tool_call");
          }
          pending.clear();
        }
        yield {
          ...event,
          finishReason: event.finishReason === "tool_use" && emittedToolCallCount === 0 && toolIssueCount > 0
            ? "stop"
            : event.finishReason,
        };
        break;

      case "error":
        suppressMalformedTextSpan = false;
        if (pending.size > 0) {
          for (const tool of pending.values()) {
            toolIssueCount++;
            yield toolCancel(tool, "provider_error_before_tool_call");
          }
          pending.clear();
        }
        yield event;
        break;
    }
  }

  if (pending.size > 0) {
    for (const tool of pending.values()) {
      yield toolCancel(tool, "stream_ended_before_tool_call");
    }
  }
}
