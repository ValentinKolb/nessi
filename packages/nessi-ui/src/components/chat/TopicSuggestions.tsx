import { createSignal, For, onMount, Show } from "solid-js";
import { memoryService } from "../../domains/memory/index.js";
import { haptics } from "../../shared/browser/haptics.js";

const MAX_SUGGESTIONS = 8;

/**
 * Conversation-starter pills shown inside the empty-state. Self-refreshes on mount
 * (empty-state only mounts when the chat is empty). Pills 5-8 are hidden below
 * the `sm` breakpoint so small screens get a readable four-pill strip.
 */
export const TopicSuggestions = (props: { onSelect: (text: string) => void }) => {
  const [topics, setTopics] = createSignal<string[]>([]);

  onMount(() => {
    void (async () => {
      const memoryTopics = await memoryService.topicSuggestions();
      const { getSuggestions } = await import("../../domains/scheduler/jobs/suggest-topics.js");
      const aiTopics = getSuggestions();
      // AI suggestions first, then memory-based, deduplicated case-insensitively.
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const t of [...aiTopics, ...memoryTopics]) {
        const key = t.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); merged.push(t); }
      }
      setTopics(merged.slice(0, MAX_SUGGESTIONS));
    })();
  });

  return (
    <Show when={topics().length > 0}>
      <div class="flex flex-col items-stretch gap-2 w-full max-w-2xl">
        <span class="text-[11px] uppercase tracking-[0.08em] text-gh-fg-subtle self-center">Try one of these</span>
        <For each={topics()}>
          {(topic, i) => (
            <button
              class={`ui-panel rounded-xl text-[13px] text-gh-fg-secondary hover:text-gh-fg text-left px-3 py-2 border border-transparent hover:border-gh-accent-muted transition-colors duration-150 ${i() >= 4 ? "hidden sm:block" : ""}`}
              onClick={() => { haptics.tap(); props.onSelect(topic); }}
            >
              {topic}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};
