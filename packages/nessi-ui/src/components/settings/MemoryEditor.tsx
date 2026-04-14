import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { readMemories, writeMemories, getMemoryLines } from "../../lib/memory.js";

const CATEGORIES = [
  { tag: "[fact]", desc: "Name, job, location, languages" },
  { tag: "[preference]", desc: "Likes, dislikes, work style" },
  { tag: "[person]", desc: "People in the user's life" },
  { tag: "[project]", desc: "Ongoing projects, goals" },
  { tag: "[followup]", desc: "Open threads, reminders" },
];

/** Manual editor for long-term memory text. */
export const MemoryEditor = () => {
  const [text, setText] = createSignal("");
  const [initial, setInitial] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  const [confirmClear, setConfirmClear] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  const loadMemory = async () => {
    const val = await readMemories();
    setText(val);
    setInitial(val);
  };

  onMount(() => {
    void loadMemory();
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
    if (clearTimer) clearTimeout(clearTimer);
  });

  const handleSave = async () => {
    await writeMemories(text());
    setInitial(text());
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    if (!confirmClear()) {
      setConfirmClear(true);
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await writeMemories("");
    setText("");
    setInitial("");
    setConfirmClear(false);
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => text() !== initial();
  const lineCount = () => text().split("\n").filter((l) => l.trim()).length;
  const hasContent = () => text().trim().length > 0;

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="settings-heading">
        <span class="i ti ti-brain" />
        <span>Memory</span>
        <span class="ml-auto text-[11px] font-normal text-gh-fg-subtle">{lineCount()} entries</span>
      </h3>
      <p class="settings-desc">
        Memories are injected into every conversation. The agent can add, update, and remove entries. You can also edit them here.
      </p>

      {/* Category legend */}
      <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gh-fg-subtle">
        {CATEGORIES.map((c) => (
          <span>
            <span class="font-mono text-gh-fg-muted">{c.tag}</span>{" "}
            {c.desc}
          </span>
        ))}
      </div>

      <div class="space-y-2">
        <textarea
          class="ui-input resize-none min-h-[80px] font-mono text-[11px]"
          placeholder={"No memories yet. The agent will save useful context here.\n\nExample:\n[fact] Name is Valentin\n[preference] Speaks German\n[project - 04/2026] Building nessi AI assistant"}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          rows={8}
        />
        <div class="ui-actions">
          <div class="ui-actions-left">
            <Show when={hasContent() && !dirty()}>
              <button
                class="text-[11px] text-gh-fg-subtle hover:text-gh-danger transition-colors"
                onClick={() => void handleClear()}
              >
                {confirmClear() ? "click again to confirm" : "clear all"}
              </button>
            </Show>
          </div>
          <div class="ui-actions-right">
            <Show when={dirty() || saved()}>
              <button class="btn-primary" onClick={() => void handleSave()}>
                {saved() ? "saved!" : "save"}
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
