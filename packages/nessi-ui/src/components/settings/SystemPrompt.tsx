import { createSignal, For, onMount } from "solid-js";
import {
  loadPrompts,
  loadUserPrompts,
  saveUserPrompts,
  getActivePromptId,
  setActivePromptId,
  newPromptId,
  type Prompt,
} from "../../lib/prompts.js";

function fromImport(raw: string): Prompt | null {
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
}

const inputClass = "ui-input";

function promptPreview(content: string): string {
  const line = content
    .split("\n")
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? "No content";
}

export function SystemPrompt(props: {
  onCreatePrompt: () => void;
  onEditPrompt: (prompt: Prompt) => void;
}) {
  const [prompts, setPrompts] = createSignal<Prompt[]>([]);
  const [activeId, setActiveId] = createSignal("default");
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");

  onMount(() => {
    setPrompts(loadPrompts());
    setActiveId(getActivePromptId());
  });

  function refreshPrompts() {
    setPrompts(loadPrompts());
  }

  function activate(id: string) {
    setActiveId(id);
    setActivePromptId(id);
  }

  function submitImport() {
    const entry = fromImport(importText());
    if (!entry) {
      alert("Invalid prompt config.");
      return;
    }
    saveUserPrompts([...loadUserPrompts(), entry]);
    setImporting(false);
    setImportText("");
    refreshPrompts();
  }

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider text-gh-fg-muted">Prompts</h3>
        <div class="flex gap-2">
          <button class="btn-secondary" onClick={() => { setImporting(!importing()); setImportText(""); }}>import</button>
          <button class="btn-secondary" onClick={props.onCreatePrompt}>+ add</button>
        </div>
      </div>

      <p class="text-[10px] leading-tight text-gh-fg-subtle">
        The active prompt is sent to the model. Placeholders: <span class="text-gh-fg-muted">{"{{date}}"}</span>,
        <span class="text-gh-fg-muted"> {"{{weekday}}"}</span>, <span class="text-gh-fg-muted">{"{{model}}"}</span>,
        <span class="text-gh-fg-muted"> {"{{skills}}"}</span>
      </p>

      {importing() && (
        <div class="ui-subpanel p-2 space-y-2">
          <input
            class={inputClass}
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
      )}

      <div class="ui-list">
        <For each={prompts()}>
          {(prompt) => (
            <div
              class={`ui-row cursor-pointer ${activeId() === prompt.id ? "ui-row-active" : ""}`}
              onClick={() => props.onEditPrompt(prompt)}
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="shrink-0 text-gh-fg-secondary">{prompt.name}</span>
                <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{promptPreview(prompt.content)}</span>
                <button
                  class="shrink-0 text-[10px] text-gh-fg-subtle hover:text-gh-fg"
                  onClick={(e) => { e.stopPropagation(); activate(prompt.id); }}
                  title="Set active"
                >
                  {activeId() === prompt.id ? "active" : "inactive"}
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
