import { createSignal, For, Show, onMount } from "solid-js";
import { humanId } from "human-id";
import {
  getProviderPresets,
  getProviderCapabilities,
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  validateProviderEntry,
  type ProviderEntry,
  type ProviderType,
  type ToolCallIdPolicy,
} from "../../lib/provider.js";
import { createCopyAction } from "../../lib/clipboard.js";

const newEntry = (): ProviderEntry => ({
  id: humanId({ separator: "-", capitalize: false }),
  type: "openai-compatible",
  name: "",
  baseURL: "http://localhost:11434/v1",
  model: "",
  toolCallIdPolicy: "passthrough",
});

/** Export format — no id, generated on import */
type ProviderExport = Omit<ProviderEntry, "id">;
const PRESETS = getProviderPresets();
const POLICY_OPTIONS: Array<{ value: ToolCallIdPolicy; label: string }> = [
  { value: "passthrough", label: "Passthrough" },
  { value: "strict9", label: "Strict 9-char alnum" },
];

const toExport = (p: ProviderEntry): ProviderExport => {
  const { id: _, ...rest } = p;
  return rest;
};

const fromImport = (raw: string): ProviderEntry | null => {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o.name !== "string" || typeof o.model !== "string") return null;
    const entry: ProviderEntry = {
      id: humanId({ separator: "-", capitalize: false }),
      type: typeof o.type === "string" ? o.type as ProviderType : "openai-compatible",
      name: o.name,
      baseURL: (o.baseURL as string) ?? "http://localhost:11434/v1",
      model: o.model,
      apiKey: (o.apiKey as string) ?? undefined,
      toolCallIdPolicy: o.toolCallIdPolicy === "strict9" ? "strict9" : "passthrough",
    };
    return validateProviderEntry(entry) ? null : entry;
  } catch { return null; }
};

/** Manage provider endpoints/models and active provider selection. */
export const ProvidersConfig = () => {
  const [providers, setProviders] = createSignal<ProviderEntry[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<ProviderEntry>(newEntry());
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const [error, setError] = createSignal("");
  const { copy: copyExport, copied: exportCopied } = createCopyAction();

  onMount(() => {
    setProviders(loadProviders());
    setActiveId(getActiveProviderId());
  });

  const persist = (list: ProviderEntry[]) => {
    setProviders(list);
    saveProviders(list);
  };

  const startAdd = () => {
    const entry = newEntry();
    setDraft(entry);
    setEditingId(entry.id);
    setError("");
  };

  const startEdit = (entry: ProviderEntry) => {
    setDraft({ ...entry });
    setEditingId(entry.id);
    setError("");
  };

  const cancel = () => {
    setEditingId(null);
    setError("");
  };

  const save = () => {
    const d = draft();
    const validationError = validateProviderEntry(d);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    const list = providers();
    const idx = list.findIndex((p) => p.id === d.id);
    if (idx >= 0) {
      const updated = [...list];
      updated[idx] = d;
      persist(updated);
    } else {
      persist([...list, d]);
    }
    if (providers().length === 1 || !activeId()) {
      setActiveId(d.id);
      setActiveProviderId(d.id);
    }
    setEditingId(null);
  };

  const remove = (id: string) => {
    const filtered = providers().filter((p) => p.id !== id);
    persist(filtered);
    if (activeId() === id) {
      const next = filtered[0]?.id ?? null;
      setActiveId(next);
      if (next) setActiveProviderId(next);
    }
    setEditingId(null);
  };

  const activate = (id: string) => {
    setActiveId(id);
    setActiveProviderId(id);
  };

  const updateDraft = (field: keyof ProviderEntry, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      type: preset.defaults.type,
      name: prev.name.trim() ? prev.name : preset.defaults.name,
      baseURL: preset.defaults.baseURL,
      model: prev.model.trim() ? prev.model : preset.defaults.model,
      toolCallIdPolicy: preset.defaults.toolCallIdPolicy,
    }));
  };

  const applyProviderType = (type: ProviderType) => {
    if (type === "openai-compatible") {
      setDraft((prev) => ({ ...prev, type }));
      return;
    }
    applyPreset(type);
  };

  const updateDraftPolicy = (value: string) => {
    const policy: ToolCallIdPolicy = value === "strict9" ? "strict9" : "passthrough";
    setDraft((prev) => ({ ...prev, toolCallIdPolicy: policy }));
  };

  const handleExport = (p: ProviderEntry) => {
    copyExport(JSON.stringify(toExport(p), null, 2));
  };

  const submitImport = () => {
    const entry = fromImport(importText());
    if (!entry) {
      setError("Invalid provider config.");
      return;
    }
    persist([...providers(), entry]);
    setError("");
    if (!activeId()) {
      setActiveId(entry.id);
      setActiveProviderId(entry.id);
    }
    setImporting(false);
    setImportText("");
    startEdit(entry);
  };

  const isNew = () => !providers().find((p) => p.id === editingId());

  const EditForm = () => {
    const editing = () => providers().find((p) => p.id === editingId());
    const capabilities = () => getProviderCapabilities(draft());
    return (
      <div class="ui-subpanel p-2 space-y-2">
        <Show when={error()}>
          <p class="text-[12px] text-gh-danger">{error()}</p>
        </Show>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select class={"ui-input"} value={draft().type} onInput={(e) => applyProviderType(e.currentTarget.value as ProviderType)}>
            <For each={PRESETS}>
              {(preset) => <option value={preset.id}>{preset.label}</option>}
            </For>
            <option value="openai-compatible">Custom OpenAI-compatible</option>
          </select>
          <input class={"ui-input"} placeholder="Name" value={draft().name} onInput={(e) => updateDraft("name", e.currentTarget.value)} />
          <input class={"ui-input"} placeholder="Model" value={draft().model} onInput={(e) => updateDraft("model", e.currentTarget.value)} />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input class={"ui-input"} placeholder="Base URL" value={draft().baseURL} onInput={(e) => updateDraft("baseURL", e.currentTarget.value)} />
          <select class={"ui-input"} value={draft().toolCallIdPolicy} onInput={(e) => updateDraftPolicy(e.currentTarget.value)}>
            <For each={POLICY_OPTIONS}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </div>
        <input type="password" class={"ui-input"} placeholder="API Key (optional)" value={draft().apiKey ?? ""} onInput={(e) => updateDraft("apiKey", e.currentTarget.value)} />
        <div class="flex items-center gap-2 text-[11px] text-gh-fg-subtle">
          <span class={`rounded-full px-2 py-0.5 ${capabilities().images ? "bg-emerald-50 text-emerald-700" : "bg-gh-surface text-gh-fg-subtle"}`}>
            {capabilities().images ? "supports images" : "text only"}
          </span>
          <span class={`rounded-full px-2 py-0.5 ${capabilities().tools ? "bg-sky-50 text-sky-700" : "bg-gh-surface text-gh-fg-subtle"}`}>
            {capabilities().tools ? "supports tools" : "no tools"}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary" onClick={cancel}>cancel</button>
          <button class="btn-primary" onClick={save}>save</button>
          <div class="flex-1" />
          <Show when={editing()}>
            <button class="btn-secondary" onClick={() => handleExport(draft())}>
              {exportCopied() ? "copied!" : "export"}
            </button>
            <button class="btn-secondary danger-text" onClick={() => remove(editingId()!)}>
              delete
            </button>
          </Show>
        </div>
      </div>
    );
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-sparkles-2" />
          <span>Providers</span>
        </h3>
        <div class="flex gap-2">
          <button class="btn-secondary" onClick={() => { setImporting(!importing()); setImportText(""); }}>import</button>
          <button class="btn-secondary" onClick={startAdd}>+ add</button>
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
            class={"ui-input"}
            placeholder="Paste JSON..."
            value={importText()}
            onInput={(e) => { setImportText(e.currentTarget.value); if (error()) setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submitImport(); }}
            autofocus
          />
          <div class="flex gap-2">
            <button class="btn-secondary" onClick={() => { setImporting(false); setImportText(""); setError(""); }}>cancel</button>
            <button class="btn-primary" onClick={submitImport}>import</button>
          </div>
        </div>
      </Show>

      <div class="ui-list">
        <For each={providers()}>
          {(p) => (
            <Show
              when={editingId() !== p.id}
              fallback={<EditForm />}
            >
              <div
                class="ui-row cursor-pointer group"
                onClick={() => startEdit(p)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="shrink-0 text-gh-fg-secondary">{p.name}</span>
                  <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{p.model} · {p.type}</span>
                  <Show when={activeId() !== p.id}>
                    <button
                      class="btn-minimal shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); activate(p.id); }}
                    >
                      set active
                    </button>
                  </Show>
                  <Show when={activeId() === p.id}>
                    <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">active</span>
                  </Show>
                  <Show when={getProviderCapabilities(p).images}>
                    <span class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">images</span>
                  </Show>
                </div>
              </div>
            </Show>
          )}
        </For>
        <Show when={providers().length === 0 && !editingId()}>
          <div class="rounded-lg border border-gh-danger/20 bg-red-50 px-3 py-4 text-center space-y-2">
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

      {/* Inline add form for new providers */}
      <Show when={editingId() !== null && isNew()}>
        <EditForm />
      </Show>
    </div>
  );
};
