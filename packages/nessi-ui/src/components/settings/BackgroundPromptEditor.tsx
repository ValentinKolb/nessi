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
} from "../../domains/scheduler/jobs/background-prompt.js";
import { settingsRepo, DEFAULT_CRON_CONFIG } from "../../domains/settings/settings.repo.js";
import { reloadCron } from "../../domains/scheduler/scheduler.js";
import { haptics } from "../../shared/browser/haptics.js";

type Tab = "metadata" | "consolidation" | "suggestions";

const TAB_TO_JOB: Record<Tab, keyof typeof DEFAULT_CRON_CONFIG> = {
  metadata: "refresh-metadata",
  consolidation: "consolidate-memory",
  suggestions: "suggest-topics",
};

export const BackgroundPromptEditor = (props: { onDone: () => void }) => {
  const [tab, setTab] = createSignal<Tab>("metadata");
  const [metadataText, setMetadataText] = createSignal("");
  const [consolidationText, setConsolidationText] = createSignal("");
  const [suggestionText, setSuggestionText] = createSignal("");
  const [metadataCron, setMetadataCron] = createSignal("");
  const [consolidationCron, setConsolidationCron] = createSignal("");
  const [suggestionCron, setSuggestionCron] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const loadPrompts = async () => {
    setMetadataText(await getBackgroundPrompt());
    setConsolidationText(await getConsolidationPrompt());
    setSuggestionText(await getSuggestionPrompt());
    setMetadataCron(await settingsRepo.getCronFor("refresh-metadata"));
    setConsolidationCron(await settingsRepo.getCronFor("consolidate-memory"));
    setSuggestionCron(await settingsRepo.getCronFor("suggest-topics"));
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
    const jobId = TAB_TO_JOB[current];
    if (current === "metadata") {
      await setBackgroundPrompt(metadataText());
      await settingsRepo.setCronFor(jobId, metadataCron());
    } else if (current === "consolidation") {
      await setConsolidationPrompt(consolidationText());
      await settingsRepo.setCronFor(jobId, consolidationCron());
    } else {
      await setSuggestionPrompt(suggestionText());
      await settingsRepo.setCronFor(jobId, suggestionCron());
    }
    await reloadCron(jobId);
    haptics.success();
    flashSaved();
  };

  const reset = async () => {
    const current = tab();
    const jobId = TAB_TO_JOB[current];
    const defaultCron = DEFAULT_CRON_CONFIG[jobId];
    if (current === "metadata") {
      const text = await resetBackgroundPrompt();
      setMetadataText(text);
      setMetadataCron(defaultCron);
    } else if (current === "consolidation") {
      const text = await resetConsolidationPrompt();
      setConsolidationText(text);
      setConsolidationCron(defaultCron);
    } else {
      const text = await resetSuggestionPrompt();
      setSuggestionText(text);
      setSuggestionCron(defaultCron);
    }
    await settingsRepo.setCronFor(jobId, defaultCron);
    await reloadCron(jobId);
    haptics.success();
    flashSaved();
  };

  const isDefault = () => {
    const current = tab();
    const jobId = TAB_TO_JOB[current];
    const defaultCron = DEFAULT_CRON_CONFIG[jobId];
    if (current === "metadata") return metadataText() === getDefaultBackgroundPrompt() && metadataCron() === defaultCron;
    if (current === "consolidation") return consolidationText() === getDefaultConsolidationPrompt() && consolidationCron() === defaultCron;
    return suggestionText() === getDefaultSuggestionPrompt() && suggestionCron() === defaultCron;
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

  const currentCron = () => {
    const current = tab();
    if (current === "metadata") return metadataCron();
    if (current === "consolidation") return consolidationCron();
    return suggestionCron();
  };

  const setCurrentCron = (cron: string) => {
    const current = tab();
    if (current === "metadata") setMetadataCron(cron);
    else if (current === "consolidation") setConsolidationCron(cron);
    else setSuggestionCron(cron);
  };

  const currentCronDefault = () => DEFAULT_CRON_CONFIG[TAB_TO_JOB[tab()]];

  /** Cron is considered valid when it passes the 5-field regex. Empty input is treated as "will fall back to default" and blocks save to avoid silent acceptance. */
  const currentCronValid = () => settingsRepo.isValidCron(currentCron());

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

      {/* Schedule */}
      <div class="shrink-0 space-y-1">
        <div class="flex items-center gap-2">
          <label class="text-[12px] text-gh-fg-muted shrink-0">Schedule (cron):</label>
          <input
            class={`ui-input font-mono text-[12px] ${currentCronValid() ? "" : "border-gh-danger"}`}
            type="text"
            value={currentCron()}
            placeholder={currentCronDefault()}
            onInput={(e) => setCurrentCron(e.currentTarget.value)}
          />
        </div>
        <Show when={!currentCronValid()}>
          <p class="text-[11px] text-gh-danger pl-[calc(6rem+0.5rem)]">
            Invalid cron expression — needs 5 whitespace-separated fields (min hour dom month dow).
          </p>
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
          <button class="btn-primary" onClick={() => void save()} disabled={!currentCronValid()}>
            {saved() ? "saved!" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
};
