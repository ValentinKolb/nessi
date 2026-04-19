import { createSignal, For, Show, onMount } from "solid-js";
import { humanId } from "human-id";
import {
  getProviderCapabilities,
  getProviderIconUrl,
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  type ProviderEntry,
  type ProviderType,
} from "../../lib/provider.js";
import { haptics } from "../../shared/browser/haptics.js";

const newEntry = (): ProviderEntry => ({
  id: humanId({ separator: "-", capitalize: false }),
  type: "openai-compatible",
  name: "",
  baseURL: "http://localhost:11434/v1",
  model: "",
  toolCallIdPolicy: "passthrough",
});

const fromImport = (raw: string): ProviderEntry | null => {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o.name !== "string" || typeof o.model !== "string") return null;
    return {
      id: humanId({ separator: "-", capitalize: false }),
      type: typeof o.type === "string" ? o.type as ProviderType : "openai-compatible",
      name: o.name,
      baseURL: (o.baseURL as string) ?? "http://localhost:11434/v1",
      model: o.model,
      apiKey: (o.apiKey as string) ?? undefined,
      toolCallIdPolicy: o.toolCallIdPolicy === "strict9" ? "strict9" : "passthrough",
      contextWindow: typeof o.contextWindow === "number" && o.contextWindow > 0 ? o.contextWindow : undefined,
    };
  } catch { return null; }
};

/** Manage provider endpoints/models and active provider selection. */
export const ProvidersConfig = (props: {
  onCreateProvider?: () => void;
  onEditProvider?: (provider: ProviderEntry) => void;
}) => {
  const [providers, setProviders] = createSignal<ProviderEntry[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const [error, setError] = createSignal("");

  onMount(() => {
    setProviders(loadProviders());
    setActiveId(getActiveProviderId());
  });

  const activate = (id: string) => {
    setActiveId(id);
    setActiveProviderId(id);
    haptics.success();
  };

  const submitImport = () => {
    const entry = fromImport(importText());
    if (!entry) {
      setError("Invalid provider config.");
      haptics.error();
      return;
    }
    const list = [...providers(), entry];
    setProviders(list);
    saveProviders(list);
    setError("");
    if (!activeId()) {
      activate(entry.id);
    }
    haptics.success();
    setImporting(false);
    setImportText("");
    // Open the imported entry for review
    props.onEditProvider?.(entry);
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-sparkles-2" />
          <span>Providers</span>
        </h3>
        <div class="flex gap-2">
          <button class="btn-secondary" onClick={() => { haptics.tap(); setImporting(!importing()); setImportText(""); setError(""); }}>import</button>
          <button class="btn-secondary" onClick={() => { haptics.tap(); props.onCreateProvider?.(); }}>+ add</button>
        </div>
      </div>

      <p class="settings-desc">
        Choose one provider type, then adjust model and base URL as needed.
      </p>

      <Show when={importing()}>
        <div class="ui-subpanel p-2 space-y-2">
          <Show when={error()}>
            <p class="text-[12px] text-gh-danger">{error()}</p>
          </Show>
          <input
            class="ui-input"
            placeholder="Paste JSON..."
            value={importText()}
            onInput={(e) => { setImportText(e.currentTarget.value); if (error()) setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submitImport(); }}
            autofocus
          />
          <div class="ui-actions-end">
            <button class="btn-secondary" onClick={() => { haptics.tap(); setImporting(false); setImportText(""); setError(""); }}>cancel</button>
            <button class="btn-primary" onClick={submitImport}>import</button>
          </div>
        </div>
      </Show>

      <div class="ui-list">
        <For each={providers()}>
          {(p) => (
            <div
              class="ui-row cursor-pointer group"
              onClick={() => { haptics.tap(); props.onEditProvider?.(p); }}
            >
              <div class="flex items-center gap-2 min-w-0">
                <img src={getProviderIconUrl(p.type)} alt="" class="h-4 w-4 shrink-0" />
                <span class="shrink-0 text-gh-fg-secondary">{p.name}</span>
                <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{p.model}</span>
                <Show when={activeId() !== p.id}>
                  <button
                    class="btn-minimal shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); activate(p.id); }}
                  >
                    set active
                  </button>
                </Show>
                <Show when={activeId() === p.id}>
                  <span class="shrink-0 rounded-full bg-status-ok-bg px-2 py-0.5 text-[11px] text-status-ok-fg">active</span>
                </Show>
                <Show when={getProviderCapabilities(p).images}>
                  <span class="shrink-0 rounded-full bg-status-info-bg px-2 py-0.5 text-[11px] text-status-info-fg">images</span>
                </Show>
              </div>
            </div>
          )}
        </For>
        <Show when={providers().length === 0}>
          <div class="rounded-lg border border-gh-danger/20 bg-status-err-bg px-3 py-4 text-center space-y-2">
            <div class="flex items-center justify-center gap-2 text-gh-danger">
              <span class="i ti ti-alert-circle text-lg" />
              <span class="text-[13px] font-medium">No providers configured</span>
            </div>
            <p class="text-[12px] text-gh-fg-muted leading-relaxed max-w-sm mx-auto">
              You need at least one provider to start chatting. Click <strong>+ add</strong> above to connect an LLM endpoint like Ollama, OpenAI, or any OpenAI-compatible API.
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
};
