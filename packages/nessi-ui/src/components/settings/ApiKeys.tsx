import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { readJson, writeJson } from "../../lib/json-storage.js";

const TAVILY_KEY = "nessi:tavily";

/** Configure API keys used by built-in integrations. */
export function ApiKeys() {
  const [tavilyKey, setTavilyKey] = createSignal("");
  const [initial, setInitial] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const val = readJson<{ apiKey?: string }>(TAVILY_KEY, {}).apiKey ?? "";
    setTavilyKey(val);
    setInitial(val);
  });

  onCleanup(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  function handleSave() {
    writeJson(TAVILY_KEY, { apiKey: tavilyKey() });
    setInitial(tavilyKey());
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  }

  const dirty = () => tavilyKey() !== initial();

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="text-xs font-bold uppercase tracking-wider text-gh-fg-muted">API Keys</h3>
      <div class="ui-subpanel p-2 space-y-2">
        <label class="block">
          <span class="text-xs text-gh-fg-muted">Tavily</span>
          <p class="text-[10px] text-gh-fg-subtle leading-tight mt-0.5">
            Get a Tavily API key at <span class="text-gh-fg-muted">tavily.com</span> to enable web search.
          </p>
          <input
            type="password"
            class="mt-1 ui-input"
            placeholder="tvly-..."
            value={tavilyKey()}
            onInput={(e) => setTavilyKey(e.currentTarget.value)}
          />
        </label>
        <Show when={dirty() || saved()}>
          <button class="btn-primary" onClick={handleSave}>
            {saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>
    </div>
  );
}
