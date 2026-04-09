import { createSignal, Show } from "solid-js";
import type { UIThinkingBlock } from "../types.js";

/** Toggleable block for model thinking traces. */
export const ThinkingBlock = (props: { block: UIThinkingBlock }) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1 text-xs">
      <button
        class="flex items-center gap-1 text-gh-fg-subtle hover:text-gh-fg-muted"
        onClick={() => setExpanded(!expanded())}
      >
        <span class={`i ti ti-chevron-${expanded() ? "up" : "right"} text-xs`} />
        <span>thinking</span>
      </button>
      <Show when={expanded()}>
        <pre class="ui-subpanel px-2 py-1 text-gh-fg-subtle whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {props.block.text}
        </pre>
      </Show>
    </div>
  );
};
