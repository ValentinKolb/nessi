import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  getCompactionPrompt,
  setCompactionPrompt,
  resetCompactionPrompt,
  getDefaultCompactionPrompt,
} from "../../lib/compaction-settings.js";

export const CompactionPromptEditor = (props: { onDone: () => void }) => {
  const [text, setText] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    void getCompactionPrompt().then(setText);
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
    await setCompactionPrompt(text());
    flashSaved();
  };

  const reset = async () => {
    const defaultText = await resetCompactionPrompt();
    setText(defaultText);
    flashSaved();
  };

  const isDefault = () => text() === getDefaultCompactionPrompt();

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      {/* Info note */}
      <div class="ui-note shrink-0">
        This prompt is used when generating checkpoint summaries during compaction.
        Use <code>{"{{conversation}}"}</code> to inject the conversation history.
        If the placeholder is omitted, the conversation is sent as the user message instead.
      </div>

      {/* Editor */}
      <textarea
        class="ui-input hide-scrollbar min-h-0 flex-1 resize-none overflow-y-auto font-mono text-[11px]"
        rows={20}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
      />

      {/* Actions */}
      <div class="ui-actions">
        <div class="ui-actions-left">
          <Show when={!isDefault()}>
            <button class="btn-secondary" onClick={() => void reset()}>reset to default</button>
          </Show>
        </div>
        <div class="ui-actions-right">
          <button class="btn-secondary" onClick={props.onDone}>cancel</button>
          <button class="btn-primary" onClick={() => void save()}>
            {saved() ? "saved!" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
};
