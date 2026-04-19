import { createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { loadProviders, type ProviderEntry } from "../../lib/provider.js";
import { settingsRepo, type ImageAnalysisSettings as ImageSettings } from "../../domains/settings/index.js";
import {
  getImageAnalysisPrompt,
  setImageAnalysisPrompt,
  resetImageAnalysisPrompt,
  getDefaultImageAnalysisPrompt,
} from "../../lib/tools/image-analysis-tool.js";
import { haptics } from "../../shared/browser/haptics.js";

export const ImageAnalysisSettings = () => {
  const [providerId, setProviderId] = createSignal<string | null>(null);
  const [promptText, setPromptText] = createSignal("");
  const [providers, setProviders] = createSignal<ProviderEntry[]>([]);
  const [saved, setSaved] = createSignal(false);
  const [promptDirty, setPromptDirty] = createSignal(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  const load = async () => {
    setProviders(loadProviders());
    const settings = await settingsRepo.getImageAnalysisSettings();
    setProviderId(settings.providerId);
    setPromptText(await getImageAnalysisPrompt());
  };

  onMount(() => { void load(); });
  onCleanup(() => { if (savedTimer) clearTimeout(savedTimer); });

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => setSaved(false), 2000);
  };

  const handleProviderChange = async (id: string) => {
    const value = id === "__default__" ? null : id;
    setProviderId(value);
    await settingsRepo.setImageAnalysisSettings({ providerId: value });
    haptics.success();
    flashSaved();
  };

  const handleSavePrompt = async () => {
    await setImageAnalysisPrompt(promptText());
    setPromptDirty(false);
    haptics.success();
    flashSaved();
  };

  const handleResetPrompt = async () => {
    const text = await resetImageAnalysisPrompt();
    setPromptText(text);
    setPromptDirty(false);
    haptics.success();
    flashSaved();
  };

  const isDefaultPrompt = () => promptText() === getDefaultImageAnalysisPrompt();

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="settings-heading">
        <span class="i ti ti-eye" />
        <span>Image Analysis</span>
      </h3>
      <p class="settings-desc">
        When the assistant needs to understand an image, it sends it to a vision-capable model via the <code>analyze_image</code> tool.
        Choose which provider handles image analysis and customize the system prompt.
      </p>

      {/* Provider selection */}
      <label class="block">
        <span class="text-[13px] text-gh-fg-muted">Provider</span>
        <select
          class="mt-1 ui-input"
          value={providerId() ?? "__default__"}
          onInput={(e) => void handleProviderChange(e.currentTarget.value)}
        >
          <option value="__default__">Chat model (default)</option>
          <For each={providers()}>
            {(p) => <option value={p.id}>{p.name || p.model}</option>}
          </For>
        </select>
      </label>

      {/* System prompt editor */}
      <label class="block">
        <span class="text-[13px] text-gh-fg-muted">System prompt</span>
        <textarea
          class="mt-1 ui-input hide-scrollbar resize-none overflow-y-auto font-mono text-[11px]"
          rows={8}
          value={promptText()}
          onInput={(e) => { setPromptText(e.currentTarget.value); setPromptDirty(true); }}
        />
      </label>

      <Show when={promptDirty() || !isDefaultPrompt() || saved()}>
        <div class="flex items-center gap-2">
          <Show when={!isDefaultPrompt()}>
            <button class="btn-secondary" onClick={() => void handleResetPrompt()}>reset to default</button>
          </Show>
          <div class="flex-1" />
          <Show when={promptDirty()}>
            <button class="btn-primary" onClick={() => void handleSavePrompt()}>
              {saved() ? "saved!" : "save prompt"}
            </button>
          </Show>
          <Show when={!promptDirty() && saved()}>
            <span class="text-[12px] text-status-ok-fg">saved!</span>
          </Show>
        </div>
      </Show>
    </div>
  );
};
