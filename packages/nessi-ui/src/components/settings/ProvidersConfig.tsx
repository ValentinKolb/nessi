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

function newEntry(): ProviderEntry {
  return {
    id: humanId({ separator: "-", capitalize: false }),
    type: "openai-compatible",
    name: "",
    baseURL: "http://localhost:11434/v1",
    model: "",
    toolCallIdPolicy: "passthrough",
  };
}

/** Export format — no id, generated on import */
type ProviderExport = Omit<ProviderEntry, "id">;
const PRESETS = getProviderPresets();
const POLICY_OPTIONS: Array<{ value: ToolCallIdPolicy; label: string }> = [
  { value: "passthrough", label: "Passthrough" },
  { value: "strict9", label: "Strict 9-char alnum" },
];

function toExport(p: ProviderEntry): ProviderExport {
  const { id: _, ...rest } = p;
  return rest;
}

function fromImport(raw: string): ProviderEntry | null {
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
}

const inputClass = "ui-input";

/** Manage provider endpoints/models and active provider selection. */
export function ProvidersConfig() {
  const [providers, setProviders] = createSignal<ProviderEntry[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<ProviderEntry>(newEntry());
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const { copy: copyExport, copied: exportCopied } = createCopyAction();

  onMount(() => {
    setProviders(loadProviders());
    setActiveId(getActiveProviderId());
  });

  function persist(list: ProviderEntry[]) {
    setProviders(list);
    saveProviders(list);
  }

  function startAdd() {
    const entry = newEntry();
    setDraft(entry);
    setEditingId(entry.id);
  }

  function startEdit(entry: ProviderEntry) {
    setDraft({ ...entry });
    setEditingId(entry.id);
  }

  function cancel() { setEditingId(null); }

  function save() {
    const d = draft();
    const validationError = validateProviderEntry(d);
    if (validationError) {
      alert(validationError);
      return;
    }
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
  }

  function remove(id: string) {
    const filtered = providers().filter((p) => p.id !== id);
    persist(filtered);
    if (activeId() === id) {
      const next = filtered[0]?.id ?? null;
      setActiveId(next);
      if (next) setActiveProviderId(next);
    }
    setEditingId(null);
  }

  function activate(id: string) {
    setActiveId(id);
    setActiveProviderId(id);
  }

  function updateDraft(field: keyof ProviderEntry, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function applyPreset(presetId: string) {
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
  }

  function applyProviderType(type: ProviderType) {
    if (type === "openai-compatible") {
      setDraft((prev) => ({ ...prev, type }));
      return;
    }
    applyPreset(type);
  }

  function updateDraftPolicy(value: string) {
    const policy: ToolCallIdPolicy = value === "strict9" ? "strict9" : "passthrough";
    setDraft((prev) => ({ ...prev, toolCallIdPolicy: policy }));
  }

  function handleExport(p: ProviderEntry) {
    copyExport(JSON.stringify(toExport(p), null, 2));
  }

  function submitImport() {
    const entry = fromImport(importText());
    if (!entry) { alert("Invalid provider config."); return; }
    persist([...providers(), entry]);
    if (!activeId()) {
      setActiveId(entry.id);
      setActiveProviderId(entry.id);
    }
    setImporting(false);
    setImportText("");
    startEdit(entry);
  }

  const isNew = () => !providers().find((p) => p.id === editingId());

  function EditForm() {
    const editing = () => providers().find((p) => p.id === editingId());
    const capabilities = () => getProviderCapabilities(draft());
    return (
      <div class="ui-subpanel p-2 space-y-2">
        <div class="grid grid-cols-3 gap-2">
          <select class={inputClass} value={draft().type} onInput={(e) => applyProviderType(e.currentTarget.value as ProviderType)}>
            <For each={PRESETS}>
              {(preset) => <option value={preset.id}>{preset.label}</option>}
            </For>
            <option value="openai-compatible">Custom OpenAI-compatible</option>
          </select>
          <input class={inputClass} placeholder="Name" value={draft().name} onInput={(e) => updateDraft("name", e.currentTarget.value)} />
          <input class={inputClass} placeholder="Model" value={draft().model} onInput={(e) => updateDraft("model", e.currentTarget.value)} />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input class={inputClass} placeholder="Base URL" value={draft().baseURL} onInput={(e) => updateDraft("baseURL", e.currentTarget.value)} />
          <select class={inputClass} value={draft().toolCallIdPolicy} onInput={(e) => updateDraftPolicy(e.currentTarget.value)}>
            <For each={POLICY_OPTIONS}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </div>
        <input type="password" class={inputClass} placeholder="API Key (optional)" value={draft().apiKey ?? ""} onInput={(e) => updateDraft("apiKey", e.currentTarget.value)} />
        <div class="flex items-center gap-2 text-[10px] text-gh-fg-subtle">
          <span class={`rounded-full px-2 py-0.5 ${capabilities().images ? "bg-emerald-50 text-emerald-700" : "bg-gh-surface text-gh-fg-subtle"}`}>
            {capabilities().images ? "supports images" : "text only"}
          </span>
          <span class={`rounded-full px-2 py-0.5 ${capabilities().tools ? "bg-sky-50 text-sky-700" : "bg-gh-surface text-gh-fg-subtle"}`}>
            {capabilities().tools ? "supports tools" : "no tools"}
          </span>
        </div>
        <div class="flex items-center gap-2">
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
  }

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider text-gh-fg-muted">Providers</h3>
        <div class="flex gap-2">
          <button class="btn-secondary" onClick={() => { setImporting(!importing()); setImportText(""); }}>import</button>
          <button class="btn-secondary" onClick={startAdd}>+ add</button>
        </div>
      </div>

      <p class="text-[10px] text-gh-fg-subtle leading-tight">
        Choose one provider type, then adjust model and base URL as needed. Existing entries without a type are treated as custom OpenAI-compatible endpoints.
      </p>

      <Show when={importing()}>
        <div class="ui-subpanel p-2 space-y-2">
          <input
            class={inputClass}
            placeholder="Paste JSON..."
            value={importText()}
            onInput={(e) => setImportText(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitImport(); }}
            autofocus
          />
          <div class="flex gap-2">
            <button class="btn-secondary" onClick={() => { setImporting(false); setImportText(""); }}>cancel</button>
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
                class={`ui-row cursor-pointer ${
                  activeId() === p.id ? "ui-row-active" : ""
                }`}
                onClick={() => startEdit(p)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="shrink-0 text-gh-fg-secondary">{p.name}</span>
                  <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{p.model} · {p.type}</span>
                  <Show when={getProviderCapabilities(p).images}>
                    <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">images</span>
                  </Show>
                  <button
                    class="shrink-0 text-[10px] text-gh-fg-subtle hover:text-gh-fg"
                    onClick={(e) => { e.stopPropagation(); activate(p.id); }}
                    title="Set active"
                  >
                    {activeId() === p.id ? "active" : "inactive"}
                  </button>
                </div>
              </div>
            </Show>
          )}
        </For>
        <Show when={providers().length === 0 && !editingId()}>
          <div class="px-2 py-3 text-xs text-gh-fg-muted text-center">
            no providers configured
          </div>
        </Show>
      </div>

      {/* Inline add form for new providers */}
      <Show when={editingId() !== null && isNew()}>
        <EditForm />
      </Show>
    </div>
  );
}
