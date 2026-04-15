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
  getSuggestionPrompt,
  setSuggestionPrompt,
  resetSuggestionPrompt,
  getDefaultSuggestionPrompt,
} from "../../lib/jobs/background-prompt.js";
import { haptics } from "../../shared/browser/haptics.js";

type Tab = "metadata" | "consolidation" | "suggestions";

export const BackgroundPromptEditor = (props: { onDone: () => void }) => {
  const [tab, setTab] = createSignal<Tab>("metadata");
  const [metadataText, setMetadataText] = createSignal("");
  const [consolidationText, setConsolidationText] = createSignal("");
  const [suggestionText, setSuggestionText] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const loadPrompts = async () => {
    setMetadataText(await getBackgroundPrompt());
    setConsolidationText(await getConsolidationPrompt());
    setSuggestionText(await getSuggestionPrompt());
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
    const current = tab();
    if (current === "metadata") await setBackgroundPrompt(metadataText());
    else if (current === "consolidation") await setConsolidationPrompt(consolidationText());
    else await setSuggestionPrompt(suggestionText());
    haptics.success();
    flashSaved();
  };

  const reset = async () => {
    const current = tab();
    if (current === "metadata") {
      const text = await resetBackgroundPrompt();
      setMetadataText(text);
    } else if (current === "consolidation") {
      const text = await resetConsolidationPrompt();
      setConsolidationText(text);
    } else {
      const text = await resetSuggestionPrompt();
      setSuggestionText(text);
    }
    haptics.success();
    flashSaved();
  };

  const isDefault = () => {
    const current = tab();
    if (current === "metadata") return metadataText() === getDefaultBackgroundPrompt();
    if (current === "consolidation") return consolidationText() === getDefaultConsolidationPrompt();
    return suggestionText() === getDefaultSuggestionPrompt();
  };

  const currentText = () => {
    const current = tab();
    if (current === "metadata") return metadataText();
    if (current === "consolidation") return consolidationText();
    return suggestionText();
  };

  const setCurrentText = (text: string) => {
    const current = tab();
    if (current === "metadata") setMetadataText(text);
    else if (current === "consolidation") setConsolidationText(text);
    else setSuggestionText(text);
  };

  const TabButton = (tabProps: { id: Tab; label: string }) => (
    <button
      class={`px-3 py-1.5 text-[13px] font-medium transition-colors relative ${
        tab() === tabProps.id
          ? "text-gh-fg"
          : "text-gh-fg-subtle hover:text-gh-fg-muted"
      }`}
      onClick={() => { haptics.tap(); setTab(tabProps.id); }}
    >
      {tabProps.label}
      <Show when={tab() === tabProps.id}>
        <span class="absolute bottom-0 left-0 right-0 h-[2px] bg-gh-accent rounded-full" />
      </Show>
    </button>
  );

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      {/* Tabs */}
      <div class="flex border-b border-gh-border-muted">
        <TabButton id="metadata" label="Chat Metadata" />
        <TabButton id="consolidation" label="Memory Consolidation" />
        <TabButton id="suggestions" label="Chat Suggestions" />
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
        <Show when={tab() === "suggestions"}>
          This prompt generates conversation starters shown when opening a new chat.
          Use <code>{"{{memories}}"}</code> and <code>{"{{recent_chats}}"}</code> to inject context.
          Recent chats are auto-generated summaries, not full transcripts.
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
      <div class="ui-actions">
        <div class="ui-actions-left">
          <Show when={!isDefault()}>
            <button class="btn-secondary" onClick={() => void reset()}>reset to default</button>
          </Show>
        </div>
        <div class="ui-actions-right">
          <button class="btn-secondary" onClick={() => { haptics.tap(); props.onDone(); }}>cancel</button>
          <button class="btn-primary" onClick={() => void save()}>
            {saved() ? "saved!" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
};
