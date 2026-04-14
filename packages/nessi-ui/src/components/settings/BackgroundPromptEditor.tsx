import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  getBackgroundPrompt,
  setBackgroundPrompt,
  resetBackgroundPrompt,
  getDefaultBackgroundPrompt,
  getConsolidationPrompt,
  setConsolidationPrompt,
  resetConsolidationPrompt,
  getDefaultConsolidationPrompt,
} from "../../lib/jobs/background-prompt.js";

type Tab = "metadata" | "consolidation";

export const BackgroundPromptEditor = (props: { onDone: () => void }) => {
  const [tab, setTab] = createSignal<Tab>("metadata");
  const [metadataText, setMetadataText] = createSignal("");
  const [consolidationText, setConsolidationText] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const loadPrompts = async () => {
    setMetadataText(await getBackgroundPrompt());
    setConsolidationText(await getConsolidationPrompt());
  };

  onMount(() => {
    void loadPrompts();
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const save = async () => {
    if (tab() === "metadata") {
      await setBackgroundPrompt(metadataText());
    } else {
      await setConsolidationPrompt(consolidationText());
    }
    flashSaved();
  };

  const reset = async () => {
    if (tab() === "metadata") {
      const text = await resetBackgroundPrompt();
      setMetadataText(text);
    } else {
      const text = await resetConsolidationPrompt();
      setConsolidationText(text);
    }
    flashSaved();
  };

  const isDefault = () =>
    tab() === "metadata"
      ? metadataText() === getDefaultBackgroundPrompt()
      : consolidationText() === getDefaultConsolidationPrompt();

  const currentText = () => tab() === "metadata" ? metadataText() : consolidationText();
  const setCurrentText = (text: string) => {
    if (tab() === "metadata") setMetadataText(text);
    else setConsolidationText(text);
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      {/* Tabs */}
      <div class="flex border-b border-gh-border-muted">
        <button
          class={`px-3 py-1.5 text-[13px] font-medium transition-colors relative ${
            tab() === "metadata"
              ? "text-gh-fg"
              : "text-gh-fg-subtle hover:text-gh-fg-muted"
          }`}
          onClick={() => setTab("metadata")}
        >
          Chat Metadata
          <Show when={tab() === "metadata"}>
            <span class="absolute bottom-0 left-0 right-0 h-[2px] bg-gh-accent rounded-full" />
          </Show>
        </button>
        <button
          class={`px-3 py-1.5 text-[13px] font-medium transition-colors relative ${
            tab() === "consolidation"
              ? "text-gh-fg"
              : "text-gh-fg-subtle hover:text-gh-fg-muted"
          }`}
          onClick={() => setTab("consolidation")}
        >
          Memory Consolidation
          <Show when={tab() === "consolidation"}>
            <span class="absolute bottom-0 left-0 right-0 h-[2px] bg-gh-accent rounded-full" />
          </Show>
        </button>
      </div>

      {/* Info note */}
      <div class="ui-note shrink-0">
        <Show when={tab() === "metadata"}>
          This prompt is sent to the LLM for each chat that needs metadata.
          Use <code>{"{{memories}}"}</code> to inject the current memories.
          The conversation transcript is sent as the user message.
        </Show>
        <Show when={tab() === "consolidation"}>
          This prompt is sent periodically to consolidate and clean up memories.
          Use <code>{"{{memories}}"}</code> to inject the current memories.
        </Show>
      </div>

      {/* Editor */}
      <textarea
        class="ui-input hide-scrollbar min-h-0 flex-1 resize-none overflow-y-auto font-mono text-[11px]"
        rows={20}
        value={currentText()}
        onInput={(e) => setCurrentText(e.currentTarget.value)}
      />

      {/* Actions */}
      <div class="flex items-center gap-2">
        <button class="btn-secondary" onClick={props.onDone}>back</button>
        <button class="btn-primary" onClick={() => void save()}>
          {saved() ? "saved!" : "save"}
        </button>
        <div class="flex-1" />
        <Show when={!isDefault()}>
          <button class="btn-secondary" onClick={() => void reset()}>reset to default</button>
        </Show>
      </div>
    </div>
  );
};
