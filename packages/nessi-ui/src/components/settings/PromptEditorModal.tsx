import { createCopyAction } from "../../lib/clipboard.js";
import { createEffect, createSignal, Show } from "solid-js";
import type { Prompt } from "../../lib/prompts.js";
import { isDefault, loadPrompts, loadUserPrompts, newPromptId, saveUserPrompts } from "../../lib/prompts.js";

type PromptDraft = {
  id: string;
  name: string;
  content: string;
};

const toDraft = (prompt: Prompt | null): PromptDraft => {
  if (!prompt) {
    return { id: newPromptId(), name: "", content: "" };
  }
  return { id: prompt.id, name: prompt.name, content: prompt.content };
};

export const PromptEditorView = (props: {
  prompt: Prompt | null;
  onCancel: () => void;
  onDone: () => void;
}) => {
  const { copy, copied } = createCopyAction();
  const [draft, setDraft] = createSignal<PromptDraft>(toDraft(props.prompt));

  createEffect(() => {
    setDraft(toDraft(props.prompt));
  });

  const exportPrompt = async () => {
    const all = await loadPrompts();
    const prompt = all.find((entry) => entry.id === draft().id) ?? {
      id: draft().id,
      name: draft().name,
      content: draft().content,
    };
    copy(JSON.stringify({ name: prompt.name, content: prompt.content }, null, 2));
  };

  const save = async () => {
    const nextPrompt: Prompt = {
      id: draft().id,
      name: draft().name.trim() || "Untitled",
      content: draft().content,
    };
    const userPrompts = await loadUserPrompts();
    const idx = userPrompts.findIndex((prompt) => prompt.id === nextPrompt.id);
    const next = idx >= 0
      ? userPrompts.map((prompt) => (prompt.id === nextPrompt.id ? nextPrompt : prompt))
      : [...userPrompts, nextPrompt];
    await saveUserPrompts(next);
    props.onDone();
  };

  const remove = async () => {
    if (!props.prompt) return;
    const prompts = await loadUserPrompts();
    await saveUserPrompts(prompts.filter((entry) => entry.id !== props.prompt!.id));
    props.onDone();
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      <div class="space-y-1.5">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Prompt Name</label>
        <input
          class="ui-input"
          value={draft().name}
          onInput={(e) => setDraft((prev) => ({ ...prev, name: e.currentTarget.value }))}
        />
      </div>
      <div class="min-h-0 flex-1 space-y-3">
        <p class="settings-desc">
          Supported placeholders: <code>{"{{date}}"}</code>, <code>{"{{weekday}}"}</code>, <code>{"{{model}}"}</code>,
          <code>{" {{skills}}"}</code>, <code>{" {{file_info}}"}</code>, <code>{" {{memories}}"}</code>.
        </p>
        <textarea
          class="ui-input hide-scrollbar h-[calc(100%-1.75rem)] min-h-0 resize-none overflow-y-auto"
          rows={20}
          value={draft().content}
          onInput={(e) => setDraft((prev) => ({ ...prev, content: e.currentTarget.value }))}
        />
      </div>
      <div class="ui-actions">
        <div class="ui-actions-left">
          <button class="btn-secondary" onClick={() => void exportPrompt()}>
            {copied() ? "copied!" : "export"}
          </button>
          <Show when={props.prompt}>
            <button class="btn-secondary danger-text" onClick={() => void remove()}>
              {props.prompt && isDefault(props.prompt) ? "reset" : "delete"}
            </button>
          </Show>
        </div>
        <div class="ui-actions-right">
          <button class="btn-secondary" onClick={props.onCancel}>cancel</button>
          <button class="btn-primary" onClick={() => void save()}>save</button>
        </div>
      </div>
    </div>
  );
};
