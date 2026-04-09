import { createSignal, Show } from "solid-js";
import type { UICompactionBlock } from "../types.js";

/** Collapsible status block that explains manual chat compaction in user-friendly language. */
export const CompactionBlock = (props: { block: UICompactionBlock }) => {
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
      class="overflow-hidden rounded-md border text-xs"
      style={{
        "background-color": "color-mix(in oklab, #efe9ff 52%, white)",
        "border-color": "color-mix(in oklab, #8b5cf6 24%, white)",
      }}
    >
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 bg-transparent text-left"
        style={{ "background-color": "color-mix(in oklab, #ede5ff 65%, white)" }}
        onClick={() => hasDetails() && setExpanded(!expanded())}
      >
        <span class="i ti ti-fold text-[13px]" style={{ color: "#7c3aed" }} />
        <div class="flex-1 min-w-0 text-gh-fg-secondary truncate">{props.block.message}</div>
        <Show when={props.block.entriesBefore !== undefined && props.block.entriesAfter !== undefined}>
          <span class="shrink-0 text-[10px]" style={{ color: "#7c3aed" }}>
            {props.block.entriesBefore}{" -> "}{props.block.entriesAfter}
          </span>
        </Show>
        <Show when={hasDetails()}>
          <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
        </Show>
      </button>

      <Show when={expanded() && hasDetails()}>
        <div
          class="space-y-2 border-t px-2 py-2 text-gh-fg-muted"
          style={{
            "background-color": "color-mix(in oklab, #f6f1ff 74%, white)",
            "border-color": "color-mix(in oklab, #8b5cf6 18%, white)",
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
                <pre
                  class="whitespace-pre-wrap break-words max-h-48 overflow-y-auto px-2 py-1 rounded-md"
                  style={{ "background-color": "color-mix(in oklab, white 86%, #ede5ff)" }}
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
