import { createMemo, createSignal, Show } from "solid-js";
import type { UIAssistantMessage } from "../types.js";
import { createCopyAction } from "../../../lib/clipboard.js";

const messageText = (message: UIAssistantMessage) =>
  message.blocks
    .flatMap((block) => {
      if (block.type === "text") return [block.text];
      if (block.type === "thinking") return [block.text];
      return [];
    })
    .join("\n\n")
    .trim();

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

  return (
    <div class="flex items-center gap-1.5 pt-1 text-[10px] text-gh-fg-subtle">
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
        onClick={() => setOpen(true)}
        title="Message info"
      >
        <span class="i ti ti-info-circle text-[13px] leading-none" />
      </button>

      <Show when={open()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,23,30,0.22)] px-4" onClick={() => setOpen(false)}>
          <div class="ui-panel w-[min(420px,92vw)] p-3 space-y-3" onClick={(event) => event.stopPropagation()}>
            <div class="flex items-center gap-2">
              <div class="text-xs font-bold uppercase tracking-wider text-gh-fg-secondary flex-1">Message stats</div>
              <button class="text-gh-fg-subtle hover:text-gh-fg" onClick={() => setOpen(false)}>
                <span class="i ti ti-x text-sm" />
              </button>
            </div>
            <div class="space-y-2 text-xs text-gh-fg-muted">
              <p>
                <span class="text-gh-fg-secondary">Model:</span> {props.message.meta?.model ?? "n/a"}
                {" · "}
                <span class="text-gh-fg-secondary">Finish:</span> {props.message.meta?.stopReason ?? "n/a"}
              </p>
              <p>
                <span class="text-gh-fg-secondary">Size:</span> {assistantWords()} words, {assistantChars()} chars
                <Show when={estimatedOutputTokens()}>
                  {(tokens) => <> · ~{tokens()} output tokens</>}
                </Show>
              </p>
              <p>
                <span class="text-gh-fg-secondary">Structure:</span> {toolCalls()} tool calls, {thinkingBlocks()} thinking blocks
              </p>
              <p>
                <span class="text-gh-fg-secondary">Timing:</span> {formatDuration(props.message.meta?.durationMs)}
                <Show when={speed()}>
                  {(value) => <> · ~{value()} tok/s</>}
                </Show>
              </p>
              <Show when={hasReportedUsage()}>
                <p>
                  <span class="text-gh-fg-secondary">Reported usage:</span>{" "}
                  {reportedInputTokens() ?? "?"} in / {reportedOutputTokens() ?? "?"} out / {reportedTotalTokens() ?? "?"} total
                  <Show when={reportedCredits()}>{(value) => <> · {value()} credits</>}</Show>
                </p>
              </Show>
              <Show when={!hasReportedUsage()}>
                <p class="text-[10px] text-gh-fg-subtle">
                  This provider did not report usage for this response, so the token numbers above are estimates based on message size.
                </p>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
