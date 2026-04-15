import { createMemo, createSignal, Show } from "solid-js";
import type { UIAssistantMessage } from "../types.js";
import { createCopyAction } from "../../../lib/clipboard.js";
import { haptics } from "../../../shared/browser/haptics.js";

const messageText = (message: UIAssistantMessage) =>
  message.blocks
    .flatMap((block) => {
      if (block.type === "text") return [block.text];
      if (block.type === "thinking") return [block.text];
      return [];
    })
    .join("\n\n")
    .trim();

/** Compact human-readable duration: "1.2s", "14s", "2m 8s" */
const shortDuration = (ms?: number) => {
  if (!ms || ms <= 0) return null;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
};

const formatDuration = (durationMs?: number) => {
  if (!durationMs || durationMs <= 0) return "n/a";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
};

const countWords = (text: string) => {
  const compact = text.trim();
  return compact ? compact.split(/\s+/).length : 0;
};

const estimateTokens = (text: string) => {
  const compact = text.trim();
  if (!compact) return null;
  return Math.max(1, Math.round(compact.length / 4));
};

const reportedStat = (value: number | undefined) =>
  typeof value === "number" && value > 0 ? String(value) : null;

export const AssistantActions = (props: { message: UIAssistantMessage }) => {
  const { copy, copied } = createCopyAction();
  const [open, setOpen] = createSignal(false);
  const text = createMemo(() => messageText(props.message));
  const assistantChars = createMemo(() => text().length);
  const assistantWords = createMemo(() => countWords(text()));
  const estimatedOutputTokens = createMemo(() => estimateTokens(text()));
  const reportedInputTokens = createMemo(() => reportedStat(props.message.meta?.usage?.input));
  const reportedOutputTokens = createMemo(() => reportedStat(props.message.meta?.usage?.output));
  const reportedTotalTokens = createMemo(() => reportedStat(props.message.meta?.usage?.total));
  const reportedCredits = createMemo(() => reportedStat(props.message.meta?.usage?.creditsUsed));
  const toolCalls = createMemo(() => props.message.blocks.filter((block) => block.type === "tool_call").length);
  const thinkingBlocks = createMemo(() => props.message.blocks.filter((block) => block.type === "thinking").length);
  const speed = createMemo(() => {
    const output = props.message.meta?.usage?.output || estimatedOutputTokens() || 0;
    const durationMs = props.message.meta?.durationMs ?? 0;
    if (!output || durationMs <= 0) return null;
    return (output / (durationMs / 1000)).toFixed(1);
  });
  const hasReportedUsage = createMemo(() => Boolean(reportedTotalTokens() || reportedInputTokens() || reportedOutputTokens()));
  const durationLabel = createMemo(() => shortDuration(props.message.meta?.durationMs));

  return (
    <div class="flex items-center gap-1 pt-1 text-[11px] text-gh-fg-subtle">
      <button
        class={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
          copied() ? "bg-gh-muted text-gh-fg" : "text-gh-fg-subtle hover:bg-gh-overlay hover:text-gh-fg"
        }`}
        onClick={() => copy(text())}
        title={copied() ? "Copied" : "Copy message"}
      >
        <span class={`i ${copied() ? "ti ti-check" : "ti ti-copy"} text-[13px] leading-none`} />
      </button>
      <button
        class="flex h-6 w-6 items-center justify-center rounded-full text-gh-fg-subtle transition-colors hover:bg-gh-overlay hover:text-gh-fg"
        onClick={() => { haptics.tap(); setOpen(true); }}
        title="Message info"
      >
        <span class="i ti ti-info-circle text-[13px] leading-none" />
      </button>
      <Show when={durationLabel()}>
        {(label) => (
          <span class="text-gh-fg-subtle select-none tabular-nums">
            took {label()}
          </span>
        )}
      </Show>

      <Show when={open()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,23,30,0.22)] px-4" onClick={() => { haptics.tap(); setOpen(false); }}>
          <div class="ui-panel w-[min(420px,92vw)] p-3 space-y-3" onClick={(event) => event.stopPropagation()}>
            <div class="flex items-center gap-2">
              <div class="text-[15px] font-semibold text-gh-fg flex-1">Message stats</div>
              <button class="flex h-7 w-7 items-center justify-center rounded-md nav-icon" onClick={() => { haptics.tap(); setOpen(false); }}>
                <span class="i ti ti-x text-base" />
              </button>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div class="ui-metric">
                <p class="ui-metric-label">Model</p>
                <p class="ui-metric-value">{props.message.meta?.model ?? "n/a"}</p>
              </div>
              <div class="ui-metric">
                <p class="ui-metric-label">Finish</p>
                <p class="ui-metric-value">{props.message.meta?.stopReason ?? "n/a"}</p>
              </div>
              <div class="ui-metric">
                <p class="ui-metric-label">Size</p>
                <p class="ui-metric-value">
                  {assistantWords()} words · {assistantChars()} chars
                  <Show when={estimatedOutputTokens()}>
                    {(tokens) => <> · ~{tokens()} tok</>}
                  </Show>
                </p>
              </div>
              <div class="ui-metric">
                <p class="ui-metric-label">Structure</p>
                <p class="ui-metric-value">{toolCalls()} tools · {thinkingBlocks()} thinking</p>
              </div>
              <div class="ui-metric">
                <p class="ui-metric-label">Timing</p>
                <p class="ui-metric-value">
                  {formatDuration(props.message.meta?.durationMs)}
                  <Show when={speed()}>
                    {(value) => <> · {value()} tok/s</>}
                  </Show>
                </p>
              </div>
              <div class="ui-metric">
                <p class="ui-metric-label">Usage</p>
                <Show when={hasReportedUsage()} fallback={
                  <p class="ui-metric-value">Estimated only</p>
                }>
                  <p class="ui-metric-value">
                    {reportedInputTokens() ?? "?"} in · {reportedOutputTokens() ?? "?"} out · {reportedTotalTokens() ?? "?"} total
                    <Show when={reportedCredits()}>{(value) => <> · {value()} credits</>}</Show>
                  </p>
                </Show>
              </div>
            </div>
            <Show when={!hasReportedUsage()}>
              <p class="text-[10px] text-gh-fg-subtle">
                This provider did not report usage for this response, so token numbers are estimated from message size.
              </p>
            </Show>
            <Show when={hasReportedUsage()}>
              <p class="text-[10px] text-gh-fg-subtle">
                Reported usage comes from the provider response.
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};
