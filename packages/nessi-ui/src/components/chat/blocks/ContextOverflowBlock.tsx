import { Show } from "solid-js";
import type { UIContextOverflowBlock } from "../types.js";
import { haptics } from "../../../shared/browser/haptics.js";

const formatTokens = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);

export const ContextOverflowBlock = (props: {
  block: UIContextOverflowBlock;
  onCompact?: () => void;
}) => {
  const cw = () => props.block.contextWindow;
  const last = () => props.block.lastTotal;

  return (
    <div class="rounded-lg border border-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2.5 text-[13px] space-y-2">
      <div class="flex items-start gap-2">
        <span class="i ti ti-alert-triangle text-amber-500 text-base shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0 space-y-1">
          <div class="font-medium text-gh-fg">Context too long</div>
          <p class="text-gh-fg-muted leading-relaxed">
            <Show when={cw()} fallback="The conversation is too long for this model. ">
              {(w) => (
                <>
                  {"This model supports max. " + formatTokens(w()) + " tokens"}
                  <Show when={last()}>
                    {(t) => <>{" (last known usage: " + formatTokens(t()) + ")"}</>}
                  </Show>
                  {". "}
                </>
              )}
            </Show>
            Compaction summarizes older messages so the conversation can continue.
          </p>
        </div>
      </div>
      {props.onCompact && (
        <div class="flex justify-end">
          <button
            class="btn-primary text-[12px] px-3 py-1.5 flex items-center gap-1.5"
            onClick={() => { haptics.tap(); props.onCompact!(); }}
          >
            <span class="i ti ti-fold text-sm" />
            Compact & retry
          </button>
        </div>
      )}
    </div>
  );
};
