import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { loadCompactionSettings, saveCompactionSettings } from "../../lib/compaction-settings.js";

const OPTIONS = [20, 30, 40, 50] as const;

export const CompactionSettings = () => {
  const [autoCompactAfterMessages, setAutoCompactAfterMessages] = createSignal(30);
  const [initial, setInitial] = createSignal(30);
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const loadSettings = async () => {
    const settings = await loadCompactionSettings();
    setAutoCompactAfterMessages(settings.autoCompactAfterMessages);
    setInitial(settings.autoCompactAfterMessages);
  };

  onMount(() => {
    void loadSettings();
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  const handleSave = async () => {
    await saveCompactionSettings({ autoCompactAfterMessages: autoCompactAfterMessages() });
    setInitial(autoCompactAfterMessages());
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => autoCompactAfterMessages() !== initial();

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="settings-heading">
        <span class="i ti ti-fold" />
        <span>Compaction</span>
      </h3>
      <p class="settings-desc">
        Automatic checkpoint summaries are based on user and assistant messages, not tool child entries.
      </p>
      <div class="ui-subpanel p-2 space-y-2">
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted">Auto-compact after messages</span>
          <p class="settings-desc mt-0.5">
            Default is 30. Higher values keep more raw history before a checkpoint summary is created.
          </p>
          <select
            class="mt-1 ui-input"
            value={String(autoCompactAfterMessages())}
            onInput={(e) => setAutoCompactAfterMessages(Number(e.currentTarget.value))}
          >
            {OPTIONS.map((value) => (
              <option value={String(value)}>{value}</option>
            ))}
          </select>
        </label>
        <Show when={dirty() || saved()}>
          <button class="btn-primary" onClick={() => void handleSave()}>
            {saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>
    </div>
  );
};
