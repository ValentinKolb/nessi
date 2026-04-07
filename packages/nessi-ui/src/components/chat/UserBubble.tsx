import { For, Show } from "solid-js";
import dayjs from "dayjs";
import type { UIUserContentPart } from "../../lib/chat-content.js";

function formatTime(ts?: string): string {
  if (!ts) return "";
  const d = dayjs(ts);
  const now = dayjs();
  if (now.diff(d, "hour") < 24) {
    return d.format("HH:mm");
  }
  return d.format("DD MMM YYYY");
}

/** Render right-aligned user text bubble with optional timestamp metadata. */
export function UserBubble(props: { content: UIUserContentPart[]; timestamp?: string; showMeta?: boolean; class?: string }) {
  const textParts = () => props.content.filter((part): part is Extract<UIUserContentPart, { type: "text" }> => part.type === "text");
  const imageParts = () => props.content.filter((part): part is Extract<UIUserContentPart, { type: "image" }> => part.type === "image");

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
      <Show when={textParts().length > 0}>
        <div class="ui-panel max-w-[80%] px-3 py-1.5 text-sm text-gh-fg-secondary">
          <For each={textParts()}>{(part) => <span>{part.text}</span>}</For>
        </div>
      </Show>
      <Show when={props.showMeta}>
        <div class="text-[10px] text-gh-fg-subtle">
          You{props.timestamp ? <> · {formatTime(props.timestamp)}</> : null}
        </div>
      </Show>
    </div>
  );
}
