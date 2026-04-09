import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { readString, removeKey, writeString } from "../../lib/json-storage.js";

const STORAGE_KEY = "nessi:memory";

/** Manual editor for long-term memory text used by the memory tool. */
export const MemoryEditor = () => {
  const [text, setText] = createSignal("");
  const [initial, setInitial] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    let val = readString(STORAGE_KEY);
    // Migrate old structured format (JSON array)
    if (val.startsWith("[")) {
      try {
        const entries = JSON.parse(val) as Array<{ content: string; category: string }>;
        val = entries.map((e) => `[${e.category}] ${e.content}`).join("\n");
        writeString(STORAGE_KEY, val);
      } catch { /* fall through */ }
    }
    setText(val);
    setInitial(val);
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  const handleSave = () => {
    const val = text().trim();
    if (val) writeString(STORAGE_KEY, val);
    else removeKey(STORAGE_KEY);
    setInitial(text());
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => text() !== initial();

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gh-fg-muted">
        <span class="i ti ti-brain text-sm" />
        <span>Memory</span>
      </h3>
      <p class="text-[10px] text-gh-fg-subtle leading-tight">
        The agent can read and update this memory. You can also edit it manually.
      </p>
      <div class="space-y-2">
        <textarea
          class="ui-input resize-none min-h-[80px]"
          placeholder="The agent will store useful context here..."
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          rows={5}
        />
        <Show when={dirty() || saved()}>
          <button class="btn-primary" onClick={handleSave}>
            {saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>
    </div>
  );
};
