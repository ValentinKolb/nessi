import { createSignal, Show } from "solid-js";
import type { UIThinkingBlock } from "../types.js";
import { haptics } from "../../../shared/browser/haptics.js";

/** Collapsible thinking block styled like a tool call. */
export const ThinkingBlock = (props: { block: UIThinkingBlock }) => {
  const [expanded, setExpanded] = createSignal(false);

  // Estimate thinking duration from text length (rough heuristic: ~15 tokens/sec, ~4 chars/token)
  const estimatedSeconds = () => Math.max(1, Math.round(props.block.text.length / 60));

  const headline = () => {
    const secs = estimatedSeconds();
    if (secs < 60) return `thought for ${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return remSecs > 0 ? `thought for ${mins}m ${remSecs}s` : `thought for ${mins}m`;
  };

  return (
    <div class="ui-panel text-[13px] overflow-hidden tool-call-block rounded-md">
      <button
        class="w-full flex items-center gap-1.5 md:gap-2 px-2 py-1 bg-gh-muted hover:bg-gh-subtle text-left tool-call-head"
        onClick={() => { haptics.tap(); setExpanded(!expanded()); }}
      >
        <span class="i ti ti-bulb text-sm text-gh-fg-subtle" />
        <span class="text-gh-fg-muted truncate flex-1">{headline()}</span>
        <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
      </button>
      <Show when={expanded()}>
        <div class="px-2 py-2">
          <pre class="overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs text-gh-fg-muted tool-call-output">
            {props.block.text}
          </pre>
        </div>
      </Show>
    </div>
  );
};
