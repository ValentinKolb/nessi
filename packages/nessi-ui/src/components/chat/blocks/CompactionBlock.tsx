import { createSignal, Show } from "solid-js";
import type { UICompactionBlock } from "../types.js";
import { haptics } from "../../../shared/browser/haptics.js";
import { PulseDots } from "../../PulseDots.js";

/** Collapsible status block that explains chat compaction in user-friendly language. */
export const CompactionBlock = (props: { block: UICompactionBlock }) => {
  const [expanded, setExpanded] = createSignal(false);

  const isPending = () => props.block.reason === "pending";

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

  let headRef!: HTMLButtonElement;

  const toggle = () => {
    if (isPending() || !hasDetails()) return;
    haptics.tap();
    setExpanded(!expanded());
    requestAnimationFrame(() => headRef.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div
      class="overflow-hidden rounded text-[13px]"
      style={{ "background-color": "var(--color-compact-bg)" }}
    >
      <button
        ref={headRef}
        class="w-full flex items-center gap-2 px-2 py-1.5 bg-transparent text-left"
        style={{ "background-color": "var(--color-compact-head)" }}
        onClick={toggle}
      >
        <span class="i ti ti-fold text-[13px]" style={{ color: "var(--color-compact-accent)" }} />
        <div class="flex-1 min-w-0 text-gh-fg-secondary truncate">
          {props.block.message}
        </div>
        <Show when={isPending()}>
          <PulseDots />
        </Show>
        <Show when={!isPending() && props.block.entriesBefore !== undefined && props.block.entriesAfter !== undefined}>
          <span class="shrink-0 text-[11px]" style={{ color: "var(--color-compact-accent)" }}>
            {props.block.entriesBefore}{" -> "}{props.block.entriesAfter}
          </span>
        </Show>
        <Show when={!isPending() && hasDetails()}>
          <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
        </Show>
      </button>

      <Show when={expanded() && hasDetails()}>
        <div
          class="space-y-2 px-2 py-2 text-gh-fg-muted"
          style={{ "background-color": "var(--color-compact-body)" }}
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
                <pre
                  class="whitespace-pre-wrap break-words max-h-48 overflow-y-auto px-2 py-1 rounded"
                  style={{ "background-color": "var(--color-compact-pre)" }}
                >
                  {preview()}
                </pre>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
};
