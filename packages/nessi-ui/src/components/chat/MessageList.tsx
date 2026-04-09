import { For, Show, createEffect, onCleanup, onMount } from "solid-js";
import type { UIMessage } from "./types.js";
import { Message } from "./Message.js";

/** Scrollable message viewport that auto-follows streaming updates. */
export const MessageList = (props: {
  messages: UIMessage[];
  streaming: boolean;
  canRetryMessage?: (message: UIMessage) => boolean;
  onRetryMessage?: (message: UIMessage) => void;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
}) => {
  let containerRef!: HTMLDivElement;
  let observer: MutationObserver | null = null;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      containerRef.scrollTop = containerRef.scrollHeight;
    });
  };

  createEffect(() => {
    // New top-level messages should always jump to bottom.
    props.messages.length;
    props.streaming;
    scrollToBottom();
  });

  onMount(() => {
    observer = new MutationObserver(() => {
      // Covers streaming text/tool updates without tracking deep state manually.
      scrollToBottom();
    });
    observer.observe(containerRef, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scrollToBottom();
  });

  onCleanup(() => {
    observer?.disconnect();
  });

  return (
    <div ref={containerRef} class="flex-1 overflow-y-auto">
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="flex items-center justify-center h-full text-gh-fg-subtle text-sm">
            <span class="select-none">$ <span class="animate-pulse">_</span></span>
          </div>
        }
      >
        <div class="max-w-4xl mx-auto">
          <For each={props.messages}>
            {(msg) => (
              <Message
                message={msg}
                canRetryLastUserMessage={props.canRetryMessage?.(msg)}
                onRetryLastUserMessage={() => props.onRetryMessage?.(msg)}
                onApproval={props.onApproval}
                onSurveySubmit={props.onSurveySubmit}
              />
            )}
          </For>
          <Show when={props.streaming}>
            <div class="px-3 py-2 text-gh-fg-muted text-sm">
              <span class="animate-pulse">...</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
