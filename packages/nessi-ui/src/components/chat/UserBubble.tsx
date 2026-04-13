import { For, Show } from "solid-js";
import type { UIUserContentPart } from "../../lib/chat-content.js";
import { formatFileSize } from "../../lib/chat-files.js";
import { messageTime } from "../../lib/date-format.js";

/** Render right-aligned user text bubble with optional timestamp metadata. */
export const UserBubble = (props: {
  content: UIUserContentPart[];
  timestamp?: string;
  showMeta?: boolean;
  class?: string;
  canRetry?: boolean;
  onRetry?: () => void;
}) => {
  const textParts = () => props.content.filter((part): part is Extract<UIUserContentPart, { type: "text" }> => part.type === "text");
  const imageParts = () => props.content.filter((part): part is Extract<UIUserContentPart, { type: "image" }> => part.type === "image");
  const fileParts = () => props.content.filter((part): part is Extract<UIUserContentPart, { type: "file" }> => part.type === "file");

  return (
    <div class={`flex flex-col items-end gap-1 ${props.class ?? ""}`}>
      <Show when={imageParts().length > 0}>
        <div class="flex max-w-[300px] flex-wrap justify-end gap-2 self-end">
          <For each={imageParts()}>
            {(part) => (
              <img
                src={part.src}
                alt={part.name ?? "uploaded image"}
                class="max-h-40 max-w-[220px] rounded-md object-contain shadow-[inset_0_0_0_1px_var(--color-gh-border-muted)]"
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={fileParts().length > 0}>
        <div class="flex max-w-[340px] flex-wrap justify-end gap-2 self-end">
          <For each={fileParts()}>
            {(part) => (
              <div class="ui-subpanel flex items-center gap-2 px-2.5 py-1 text-xs text-gh-fg-secondary">
                <span class={`i ${part.mimeType === "application/pdf" ? "ti ti-file-type-pdf" : "ti ti-file-text"} text-sm text-gh-fg-subtle`} />
                <span class="max-w-[180px] truncate">{part.name}</span>
                <span class="text-[10px] text-gh-fg-subtle">{formatFileSize(part.size)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={textParts().length > 0}>
        <div class="ui-panel max-w-[80%] px-3 py-1.5 text-[15px] text-gh-fg-secondary">
          <For each={textParts()}>{(part) => <span>{part.text}</span>}</For>
        </div>
      </Show>
      <Show when={props.showMeta}>
        <div class="flex items-center gap-1 text-[11px] text-gh-fg-subtle">
          <span>
            You{props.timestamp ? <> · {messageTime(props.timestamp)}</> : null}
          </span>
          <Show when={props.canRetry}>
            <button
              class="flex h-5 w-5 items-center justify-center rounded-full text-gh-fg-subtle transition-colors hover:bg-gh-overlay hover:text-gh-fg"
              onClick={() => props.onRetry?.()}
              aria-label="Run this message again"
            >
              <span class="i ti ti-reload text-[12px]" />
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};
