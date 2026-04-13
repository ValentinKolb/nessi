import { createSignal, For, Show, onMount } from "solid-js";
import {
  loadPrompts,
  loadUserPrompts,
  saveUserPrompts,
  getActivePromptId,
  setActivePromptId,
  newPromptId,
  type Prompt,
} from "../../lib/prompts.js";

const fromImport = (raw: string): Prompt | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<Prompt>;
    if (typeof parsed.name !== "string" || typeof parsed.content !== "string") return null;
    return {
      id: typeof parsed.id === "string" && parsed.id.trim() ? parsed.id : newPromptId(),
      name: parsed.name,
      content: parsed.content,
    };
  } catch {
    return null;
  }
};

const promptPreview = (content: string) => {
  const line = content
    .split("\n")
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? "No content";
};

export const SystemPrompt = (props: {
  onCreatePrompt: () => void;
  onEditPrompt: (prompt: Prompt) => void;
}) => {
  const [prompts, setPrompts] = createSignal<Prompt[]>([]);
  const [activeId, setActiveId] = createSignal("default");
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");

  onMount(() => {
    setPrompts(loadPrompts());
    setActiveId(getActivePromptId());
  });

  const refreshPrompts = () => {
    setPrompts(loadPrompts());
  };

  const activate = (id: string) => {
    setActiveId(id);
    setActivePromptId(id);
  };

  const submitImport = () => {
    const entry = fromImport(importText());
    if (!entry) {
      alert("Invalid prompt config.");
      return;
    }
    saveUserPrompts([...loadUserPrompts(), entry]);
    setImporting(false);
    setImportText("");
    refreshPrompts();
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-bubble" />
          <span>Prompts</span>
        </h3>
        <div class="flex gap-2">
          <button class="btn-secondary" onClick={() => { setImporting(!importing()); setImportText(""); }}>import</button>
          <button class="btn-secondary" onClick={props.onCreatePrompt}>+ add</button>
        </div>
      </div>

      <p class="settings-desc">
        The active prompt is sent to the model. Placeholders: <span class="text-gh-fg-muted">{"{{date}}"}</span>,
        <span class="text-gh-fg-muted"> {"{{weekday}}"}</span>, <span class="text-gh-fg-muted">{"{{model}}"}</span>,
        <span class="text-gh-fg-muted"> {"{{skills}}"}</span>, <span class="text-gh-fg-muted">{"{{file_info}}"}</span>
      </p>

      <Show when={importing()}>
        <div class="ui-subpanel p-2 space-y-2">
          <input
            class="ui-input"
            placeholder="Paste JSON..."
            value={importText()}
            onInput={(e) => setImportText(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitImport(); }}
          />
          <div class="flex gap-2">
            <button class="btn-secondary" onClick={() => { setImporting(false); setImportText(""); }}>cancel</button>
            <button class="btn-primary" onClick={submitImport}>import</button>
          </div>
        </div>
      </Show>

      <div class="ui-list">
        <For each={prompts()}>
          {(prompt) => (
            <div
              class="ui-row cursor-pointer group"
              onClick={() => props.onEditPrompt(prompt)}
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="shrink-0 text-gh-fg-secondary">{prompt.name}</span>
                <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{promptPreview(prompt.content)}</span>
                <Show when={activeId() === prompt.id}>
                  <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">active</span>
                </Show>
                <Show when={activeId() !== prompt.id}>
                  <button
                    class="btn-minimal shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); activate(prompt.id); }}
                  >
                    set active
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
