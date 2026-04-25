import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { UIMessage, UIAssistantMessage } from "./types.js";
import { isAssistantMessage } from "./guards.js";
import { Message } from "./Message.js";
import { PulseDots } from "../PulseDots.js";
import { TopicSuggestions } from "./TopicSuggestions.js";

const formatElapsed = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
};

/** Live elapsed-time counter that appears after a 3s delay. */
const WorkingTimer = (props: { startedAt?: string }) => {
  const [elapsed, setElapsed] = createSignal(0);
  const [visible, setVisible] = createSignal(false);
  let interval: ReturnType<typeof setInterval> | undefined;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    if (!props.startedAt) return Date.now();
    return new Date(props.startedAt).getTime();
  };

  onMount(() => {
    // Show after 3s delay to avoid flicker on fast responses
    delayTimer = setTimeout(() => setVisible(true), 3000);

    interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start()) / 1000));
    }, 1000);
  });

  onCleanup(() => {
    if (interval) clearInterval(interval);
    if (delayTimer) clearTimeout(delayTimer);
  });

  const label = () => {
    return formatElapsed(elapsed());
  };

  return (
    <div class="px-3 py-2 text-[12px] text-gh-fg-subtle flex items-center gap-2">
      <PulseDots />
      <span class="select-none">
        <Show when={visible()} fallback="Thinking">
          Thinking for {label()}
        </Show>
      </span>
    </div>
  );
};

/** Scrollable message viewport that auto-follows streaming updates. */
export const MessageList = (props: {
  chatId: string;
  messages: UIMessage[];
  streaming: boolean;
  canRetryMessage?: (message: UIMessage) => boolean;
  onRetryMessage?: (message: UIMessage) => void;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
  onCompact?: () => void;
  onSelectSuggestion?: (text: string) => void;
}) => {
  let containerRef!: HTMLDivElement;
  let observer: MutationObserver | null = null;
  let following = true;

  const isNearBottom = () => {
    const { scrollTop, scrollHeight, clientHeight } = containerRef;
    return scrollHeight - scrollTop - clientHeight < 80;
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      containerRef.scrollTop = containerRef.scrollHeight;
    });
  };

  const handleScroll = () => {
    following = isNearBottom();
  };

  createEffect(() => {
    props.messages.length;
    props.streaming;
    scrollToBottom();
    following = true;
  });

  onMount(() => {
    observer = new MutationObserver(() => {
      if (following) scrollToBottom();
    });
    observer.observe(containerRef, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scrollToBottom();
  });

  onCleanup(() => { observer?.disconnect(); });

  /** Get startedAt from the last assistant message (the one currently streaming). */
  const streamingStartedAt = () => {
    if (!props.streaming) return undefined;
    for (let i = props.messages.length - 1; i >= 0; i--) {
      const msg = props.messages[i]!;
      if (isAssistantMessage(msg)) return (msg as UIAssistantMessage).meta?.startedAt;
    }
    return undefined;
  };

  return (
    <div ref={containerRef} class="flex-1 overflow-y-auto" onScroll={handleScroll}>
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center h-full gap-6 select-none px-4">
            <div class="flex flex-col items-center gap-1.5">
              <img src="/logo.svg" alt="" class="h-7 w-7 opacity-20" />
              <span class="text-[15px] text-gh-fg-subtle">What can I help with?</span>
            </div>
            <Show when={props.onSelectSuggestion}>
              {(onSelect) => <TopicSuggestions onSelect={onSelect()} />}
            </Show>
          </div>
        }
      >
        <div class="max-w-4xl mx-auto">
          <For each={props.messages}>
            {(msg, i) => {
              const isLastAssistant = () => {
                if (msg.role !== "assistant") return undefined;
                const next = props.messages[i() + 1];
                return !next || next.role !== "assistant";
              };
              return (
                <Message
                  chatId={props.chatId}
                  message={msg}
                  isLastAssistantInSequence={isLastAssistant()}
                  canRetryLastUserMessage={props.canRetryMessage?.(msg)}
                  onRetryLastUserMessage={() => props.onRetryMessage?.(msg)}
                  onApproval={props.onApproval}
                  onSurveySubmit={props.onSurveySubmit}
                  onCompact={props.onCompact}
                />
              );
            }}
          </For>
          <Show when={props.streaming}>
            <WorkingTimer startedAt={streamingStartedAt()} />
          </Show>
        </div>
      </Show>
    </div>
  );
};
