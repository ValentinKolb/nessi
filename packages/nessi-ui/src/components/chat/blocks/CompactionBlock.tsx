import { createSignal, Show } from "solid-js";
import type { UICompactionBlock } from "../types.js";

/** Collapsible status block that explains manual chat compaction in user-friendly language. */
export function CompactionBlock(props: { block: UICompactionBlock }) {
  const [expanded, setExpanded] = createSignal(false);

  const reduced = () => {
    const before = props.block.entriesBefore ?? 0;
    const after = props.block.entriesAfter ?? 0;
    return Math.max(0, before - after);
  };

  const hasDetails = () => Boolean(
    props.block.entriesBefore !== undefined
      || props.block.summaryPreview
      || props.block.error,
  );

  return (
    <div
      class="my-1 overflow-hidden rounded-md border bg-gh-agent-bg text-xs"
      style={{ "border-color": "color-mix(in oklab, var(--color-gh-agent-border) 30%, white)" }}
    >
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 bg-transparent text-left hover:bg-gh-agent-bg-strong"
        onClick={() => hasDetails() && setExpanded(!expanded())}
      >
        <span class="i ti ti-fold text-gh-fg-secondary" />
        <div class="flex-1 min-w-0">
          <div class="text-gh-fg-secondary">{props.block.title}</div>
          <div class="text-gh-fg-muted truncate">{props.block.message}</div>
        </div>
        <Show when={hasDetails()}>
          <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
        </Show>
      </button>

      <Show when={expanded() && hasDetails()}>
        <div
          class="space-y-1 border-t px-2 py-2 text-gh-fg-muted"
          style={{
            "background-color": "color-mix(in oklab, var(--color-gh-overlay) 82%, white)",
            "border-color": "color-mix(in oklab, var(--color-gh-agent-border) 18%, white)",
          }}
        >
          <div>Session: <span class="text-gh-fg-secondary">{props.block.sessionName}</span></div>
          <Show when={props.block.entriesBefore !== undefined && props.block.entriesAfter !== undefined}>
            <div>
              Context entries: <span class="text-gh-fg-secondary">{props.block.entriesBefore}</span>
              {" -> "}
              <span class="text-gh-fg-secondary">{props.block.entriesAfter}</span>
              {" "}({reduced()} condensed)
            </div>
          </Show>
          <Show when={props.block.error}>
            {(error) => <div class="text-gh-danger">Error: {error()}</div>}
          </Show>
          <Show when={props.block.summaryPreview}>
            {(preview) => (
              <div>
                <div class="text-gh-fg-secondary mb-1">Checkpoint summary preview</div>
                <pre class="whitespace-pre-wrap break-words max-h-48 overflow-y-auto px-2 py-1 bg-gh-surface rounded-md">
                  {preview()}
                </pre>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
