import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import {
  getProviderPresets,
  getProviderCapabilities,
  getProviderIconUrl,
  validateProviderEntry,
  type ProviderEntry,
  type ProviderType,
  type ToolCallIdPolicy,
} from "../../lib/provider.js";
import { createCopyAction } from "../../lib/clipboard.js";
import { haptics } from "../../shared/browser/haptics.js";

const PRESETS = getProviderPresets();
const POLICY_OPTIONS: Array<{ value: ToolCallIdPolicy; label: string; desc: string }> = [
  { value: "passthrough", label: "Passthrough", desc: "Forward tool call IDs as-is from the provider." },
  { value: "strict9", label: "Strict 9-char alnum", desc: "Replace IDs with short alphanumeric strings. Required for Mistral and some local models." },
];

const L = (props: { href: string; children: JSX.Element }) => (
  <a href={props.href} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">{props.children}</a>
);

const PROVIDER_HINTS: Partial<Record<ProviderType, { icon: string; content: () => JSX.Element }>> = {
  ollama: {
    icon: "ti-server",
    content: () => <>Ollama must be running locally. The default URL is <code>http://localhost:11434</code>. Model names match your pulled models (e.g. <code>llama3.1</code>, <code>qwen2.5</code>).</>,
  },
  openai: {
    icon: "ti-brand-openai",
    content: () => <>Get your API key at <L href="https://platform.openai.com/api-keys">platform.openai.com</L>. Popular models: <code>gpt-4.1-mini</code>, <code>gpt-4.1</code>, <code>o4-mini</code>.</>,
  },
  anthropic: {
    icon: "ti-brain",
    content: () => <>Get your API key at <L href="https://console.anthropic.com">console.anthropic.com</L>. Popular models: <code>claude-sonnet-4-20250514</code>, <code>claude-3-5-haiku-latest</code>.</>,
  },
  openrouter: {
    icon: "ti-route",
    content: () => <>Get your API key at <L href="https://openrouter.ai/keys">openrouter.ai</L>. Supports hundreds of models from all providers. Use provider/model format (e.g. <code>openai/gpt-4.1-mini</code>).</>,
  },
  gemini: {
    icon: "ti-brand-google",
    content: () => <>Get your API key at <L href="https://aistudio.google.com/apikey">aistudio.google.com</L>. Popular models: <code>gemini-2.0-flash</code>, <code>gemini-2.5-pro</code>.</>,
  },
  mistral: {
    icon: "ti-wind",
    content: () => <>Get your API key at <L href="https://console.mistral.ai">console.mistral.ai</L>. Requires "Strict 9-char alnum" tool call ID policy. Popular models: <code>mistral-small-latest</code>.</>,
  },
  vllm: {
    icon: "ti-server-bolt",
    content: () => <>vLLM server must be running. Default URL is <code>http://localhost:8000/v1</code>. Model name must match the served model exactly.</>,
  },
};

export const ProviderEditorView = (props: {
  provider: ProviderEntry | null;
  isNew: boolean;
  onCancel: () => void;
  onSave: (entry: ProviderEntry) => void;
  onDelete?: (id: string) => void;
}) => {
  const { copy, copied } = createCopyAction();
  const [draft, setDraft] = createSignal<ProviderEntry>(
    props.provider ?? {
      id: "",
      type: "openai-compatible",
      name: "",
      baseURL: "http://localhost:11434/v1",
      model: "",
      toolCallIdPolicy: "passthrough",
    },
  );
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.provider) setDraft({ ...props.provider });
  });

  const update = (field: keyof ProviderEntry, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (error()) setError("");
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

  const handleSave = () => {
    const d = draft();
    const validationError = validateProviderEntry(d);
    if (validationError) {
      setError(validationError);
      haptics.error();
      return;
    }
    haptics.success();
    props.onSave(d);
  };

  const handleExport = () => {
    const { id: _, ...rest } = draft();
    copy(JSON.stringify(rest, null, 2));
  };

  const hint = () => PROVIDER_HINTS[draft().type];
  const capabilities = () => {
    try { return getProviderCapabilities(draft()); }
    catch { return { images: false, tools: false }; }
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      <Show when={error()}>
        <p class="text-[12px] text-gh-danger">{error()}</p>
      </Show>

      {/* Provider type */}
      <div class="space-y-1">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Provider</label>
        <div class="flex items-center gap-2">
          <img src={getProviderIconUrl(draft().type)} alt="" class="h-5 w-5 shrink-0" />
          <select
            class="ui-input flex-1"
            value={draft().type}
            onInput={(e) => applyProviderType(e.currentTarget.value as ProviderType)}
          >
            <For each={PRESETS}>
              {(preset) => <option value={preset.id}>{preset.label}</option>}
            </For>
            <option value="openai-compatible">Custom OpenAI-compatible</option>
          </select>
        </div>
      </div>

      {/* Provider-specific hint */}
      <Show when={hint()}>
        {(h) => (
          <div class="ui-note flex items-start gap-2">
            <span class={`i ti ${h().icon} text-sm shrink-0 mt-0.5`} />
            <span>{h().content()}</span>
          </div>
        )}
      </Show>

      {/* Name & Model */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Name</label>
          <input
            class="ui-input"
            placeholder="My Provider"
            value={draft().name}
            onInput={(e) => update("name", e.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Model</label>
          <input
            class="ui-input"
            placeholder="llama3.1"
            value={draft().model}
            onInput={(e) => update("model", e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Base URL */}
      <div class="space-y-1">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Base URL</label>
        <input
          class="ui-input"
          placeholder="http://localhost:11434/v1"
          value={draft().baseURL}
          onInput={(e) => update("baseURL", e.currentTarget.value)}
        />
      </div>

      {/* API Key */}
      <div class="space-y-1">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">API Key</label>
        <input
          type="password"
          class="ui-input"
          placeholder="optional — only needed for cloud providers"
          value={draft().apiKey ?? ""}
          onInput={(e) => update("apiKey", e.currentTarget.value)}
        />
      </div>

      {/* Context Window */}
      <div class="space-y-1">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Context Window</label>
        <input
          type="number"
          class="ui-input"
          placeholder="auto (provider default)"
          value={draft().contextWindow ?? ""}
          onInput={(e) => {
            const raw = e.currentTarget.value.trim();
            const num = raw ? parseInt(raw, 10) : undefined;
            setDraft((prev) => ({ ...prev, contextWindow: num && num > 0 ? num : undefined }));
            if (error()) setError("");
          }}
        />
        <p class="settings-desc mt-0.5">
          Max tokens the model supports. Used for automatic compaction. Leave empty to use the provider's default.
        </p>
      </div>

      {/* Tool Call ID Policy */}
      <div class="space-y-1">
        <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Tool Call ID Policy</label>
        <select
          class="ui-input"
          value={draft().toolCallIdPolicy}
          onInput={(e) => {
            const policy: ToolCallIdPolicy = e.currentTarget.value === "strict9" ? "strict9" : "passthrough";
            setDraft((prev) => ({ ...prev, toolCallIdPolicy: policy }));
          }}
        >
          <For each={POLICY_OPTIONS}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
        <p class="settings-desc mt-0.5">
          {POLICY_OPTIONS.find((o) => o.value === draft().toolCallIdPolicy)?.desc}
        </p>
      </div>

      {/* Capability badges */}
      <div class="flex items-center gap-2 text-[11px]">
        <span class={`rounded-full px-2 py-0.5 ${capabilities().images ? "bg-status-ok-bg text-status-ok-fg" : "bg-gh-surface text-gh-fg-subtle"}`}>
          {capabilities().images ? "supports images" : "text only"}
        </span>
        <span class={`rounded-full px-2 py-0.5 ${capabilities().tools ? "bg-status-info-bg text-status-info-fg" : "bg-gh-surface text-gh-fg-subtle"}`}>
          {capabilities().tools ? "supports tools" : "no tools"}
        </span>
      </div>

      {/* Spacer */}
      <div class="flex-1" />

      {/* Actions */}
      <div class="ui-actions">
        <div class="ui-actions-left">
          <Show when={!props.isNew}>
            <button class="btn-secondary" onClick={handleExport}>
              {copied() ? "copied!" : "export"}
            </button>
          </Show>
          <Show when={!props.isNew && props.onDelete}>
            <button class="btn-secondary danger-text" onClick={() => { haptics.tap(); props.onDelete!(draft().id); }}>
              delete
            </button>
          </Show>
        </div>
        <div class="ui-actions-right">
          <button class="btn-secondary" onClick={() => { haptics.tap(); props.onCancel(); }}>cancel</button>
          <button class="btn-primary" onClick={handleSave}>save</button>
        </div>
      </div>
    </div>
  );
};
