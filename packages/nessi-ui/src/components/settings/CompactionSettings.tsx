import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { loadCompactionSettings, saveCompactionSettings } from "../../lib/compaction-settings.js";
import { haptics } from "../../shared/browser/haptics.js";

const MESSAGE_OPTIONS = [10, 20, 30, 40, 50, 60, 80] as const;
const LOOP_OPTIONS = [2, 4, 6, 8, 10, 12, 16, 20] as const;
const TOOL_CHAR_OPTIONS = [100, 200, 300, 500, 800, 1000, 2000] as const;
const SOURCE_CHAR_OPTIONS = [4_000, 8_000, 12_000, 16_000, 24_000, 40_000, 60_000, 100_000] as const;

const formatSourceChars = (value: number) =>
  value >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : String(value);

export const CompactionSettings = (props: { onEditPrompt?: () => void }) => {
  const [autoCompactAfterMessages, setAutoCompactAfterMessages] = createSignal(30);
  const [keepRecentLoops, setKeepRecentLoops] = createSignal(8);
  const [maxToolChars, setMaxToolChars] = createSignal(300);
  const [maxSourceChars, setMaxSourceChars] = createSignal(24_000);

  const [initial, setInitial] = createSignal({ m: 30, l: 8, t: 300, s: 24_000 });
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  const loadSettings = async () => {
    const s = await loadCompactionSettings();
    setAutoCompactAfterMessages(s.autoCompactAfterMessages);
    setKeepRecentLoops(s.keepRecentLoops);
    setMaxToolChars(s.maxToolChars);
    setMaxSourceChars(s.maxSourceChars);
    setInitial({ m: s.autoCompactAfterMessages, l: s.keepRecentLoops, t: s.maxToolChars, s: s.maxSourceChars });
  };

  onMount(() => {
    void loadSettings();
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  const handleSave = async () => {
    const settings = {
      autoCompactAfterMessages: autoCompactAfterMessages(),
      keepRecentLoops: keepRecentLoops(),
      maxToolChars: maxToolChars(),
      maxSourceChars: maxSourceChars(),
    };
    await saveCompactionSettings(settings);
    setInitial({ m: settings.autoCompactAfterMessages, l: settings.keepRecentLoops, t: settings.maxToolChars, s: settings.maxSourceChars });
    haptics.success();
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => {
    const i = initial();
    return autoCompactAfterMessages() !== i.m
      || keepRecentLoops() !== i.l
      || maxToolChars() !== i.t
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
        Recent conversation loops (user message + assistant response including tool calls) are always kept in full.
      </p>
      <div class="ui-subpanel p-2 space-y-2">

        {/* Auto-compact after messages */}
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted">Compact after messages</span>
          <p class="settings-desc mt-0.5">
            Number of messages (user + assistant) before a checkpoint summary is created.
          </p>
          <select
            class="mt-1 ui-input"
            value={String(autoCompactAfterMessages())}
            onInput={(e) => setAutoCompactAfterMessages(Number(e.currentTarget.value))}
          >
            {MESSAGE_OPTIONS.map((v) => (
              <option value={String(v)}>{v}</option>
            ))}
          </select>
        </label>

        {/* Keep recent loops */}
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted">Keep recent loops</span>
          <p class="settings-desc mt-0.5">
            Number of recent conversation loops kept as raw messages (not summarized). Higher values give the agent more context but use more tokens.
          </p>
          <select
            class="mt-1 ui-input"
            value={String(keepRecentLoops())}
            onInput={(e) => setKeepRecentLoops(Number(e.currentTarget.value))}
          >
            {LOOP_OPTIONS.map((v) => (
              <option value={String(v)}>{v} loops</option>
            ))}
          </select>
        </label>

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
