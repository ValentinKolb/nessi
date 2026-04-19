import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { loadCompactionSettings, saveCompactionSettings } from "../../lib/compaction-settings.js";
import { haptics } from "../../shared/browser/haptics.js";

const TOOL_CHAR_OPTIONS = [100, 200, 300, 500, 800, 1000, 2000] as const;
const SOURCE_CHAR_OPTIONS = [4_000, 8_000, 12_000, 16_000, 24_000, 40_000, 60_000, 100_000] as const;

const formatSourceChars = (value: number) =>
  value >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : String(value);

export const CompactionSettings = (props: { onEditPrompt?: () => void }) => {
  const [maxToolChars, setMaxToolChars] = createSignal(300);
  const [maxSourceChars, setMaxSourceChars] = createSignal(24_000);

  const [initial, setInitial] = createSignal({ t: 300, s: 24_000 });
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  const loadSettings = async () => {
    const s = await loadCompactionSettings();
    setMaxToolChars(s.maxToolChars);
    setMaxSourceChars(s.maxSourceChars);
    setInitial({ t: s.maxToolChars, s: s.maxSourceChars });
  };

  onMount(() => {
    void loadSettings();
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  const handleSave = async () => {
    const settings = {
      maxToolChars: maxToolChars(),
      maxSourceChars: maxSourceChars(),
    };
    await saveCompactionSettings(settings);
    setInitial({ t: settings.maxToolChars, s: settings.maxSourceChars });
    haptics.success();
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => {
    const i = initial();
    return maxToolChars() !== i.t
      || maxSourceChars() !== i.s;
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="settings-heading">
        <span class="i ti ti-fold" />
        <span>Compaction</span>
      </h3>
      <p class="settings-desc">
        Checkpoint summaries compress older messages to keep the context window manageable.
        Compaction triggers automatically when the context approaches the model's limit.
        Recent conversation loops are always kept in full.
      </p>
      <div class="ui-subpanel p-2 space-y-2">

        {/* Max tool chars */}
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted">Max tool content chars</span>
          <p class="settings-desc mt-0.5">
            Tool inputs and outputs longer than this are truncated in the summary source (first half + last half, middle omitted).
          </p>
          <select
            class="mt-1 ui-input"
            value={String(maxToolChars())}
            onInput={(e) => setMaxToolChars(Number(e.currentTarget.value))}
          >
            {TOOL_CHAR_OPTIONS.map((v) => (
              <option value={String(v)}>{v}</option>
            ))}
          </select>
        </label>

        {/* Max source chars */}
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted">Max summary source chars</span>
          <p class="settings-desc mt-0.5">
            Total character limit for the conversation text sent to the LLM for summarization.
          </p>
          <select
            class="mt-1 ui-input"
            value={String(maxSourceChars())}
            onInput={(e) => setMaxSourceChars(Number(e.currentTarget.value))}
          >
            {SOURCE_CHAR_OPTIONS.map((v) => (
              <option value={String(v)}>{formatSourceChars(v)}</option>
            ))}
          </select>
        </label>

        <Show when={dirty() || saved()}>
          <div class="ui-actions-end">
            <button class="btn-primary" onClick={() => void handleSave()}>
              {saved() ? "saved!" : "save"}
            </button>
          </div>
        </Show>
      </div>

      <Show when={props.onEditPrompt}>
        <button class="btn-minimal" onClick={() => { haptics.tap(); props.onEditPrompt?.(); }}>
          edit compaction prompt
        </button>
      </Show>
    </div>
  );
};
