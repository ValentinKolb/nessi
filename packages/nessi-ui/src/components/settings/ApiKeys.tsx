import { createSignal, Show, onCleanup, onMount } from "solid-js";
import { readJson, writeJson } from "../../lib/json-storage.js";
import { haptics } from "../../shared/browser/haptics.js";

const TAVILY_KEY = "nessi:tavily";
const GITHUB_KEY = "nessi:github";
const TWELVEDATA_KEY = "nessi:twelvedata";
const NEXTCLOUD_KEY = "nessi:nextcloud";

const useApiKey = (storageKey: string) => {
  const [value, setValue] = createSignal("");
  const [initial, setInitial] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const val = readJson<{ apiKey?: string }>(storageKey, {}).apiKey ?? "";
    setValue(val);
    setInitial(val);
  });

  onCleanup(() => { if (timer) clearTimeout(timer); });

  const save = () => {
    const normalized = value().trim();
    setValue(normalized);
    writeJson(storageKey, { apiKey: normalized });
    setInitial(normalized);
    haptics.success();
    setSaved(true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => value() !== initial();

  return { value, setValue, dirty, saved, save };
};

type NextcloudConfig = { url?: string; user?: string; appPassword?: string };

const useNextcloudConfig = () => {
  const [config, setConfig] = createSignal<NextcloudConfig>({});
  const [initial, setInitial] = createSignal<NextcloudConfig>({});
  const [saved, setSaved] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const val = readJson<NextcloudConfig>(NEXTCLOUD_KEY, {});
    setConfig(val);
    setInitial(val);
  });

  onCleanup(() => { if (timer) clearTimeout(timer); });

  const update = (key: keyof NextcloudConfig, val: string) =>
    setConfig((c) => ({ ...c, [key]: val }));

  const save = () => {
    const normalized = {
      url: (config().url ?? "").trim().replace(/\/+$/, ""),
      user: (config().user ?? "").trim(),
      appPassword: (config().appPassword ?? "").trim(),
    };
    setConfig(normalized);
    writeJson(NEXTCLOUD_KEY, normalized);
    setInitial(normalized);
    haptics.success();
    setSaved(true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setSaved(false), 2000);
  };

  const dirty = () => JSON.stringify(config()) !== JSON.stringify(initial());

  return { config, update, dirty, saved, save };
};

/** Configure API keys used by built-in integrations. */
export const ApiKeys = (props: {
  onShowGitHubHelp?: () => void;
  onShowNextcloudHelp?: () => void;
}) => {
  const tavily = useApiKey(TAVILY_KEY);
  const github = useApiKey(GITHUB_KEY);
  const twelvedata = useApiKey(TWELVEDATA_KEY);
  const nc = useNextcloudConfig();

  return (
    <div class="ui-panel p-3 space-y-2">
      <h3 class="settings-heading">
        <span class="i ti ti-key" />
        <span>API Keys</span>
      </h3>

      {/* Tavily */}
      <div class="ui-subpanel p-2 space-y-2">
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted flex items-center gap-1.5"><span class="i ti ti-world-search text-sm" />Tavily</span>
          <p class="settings-desc mt-0.5">
            Get a Tavily API key at <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">tavily.com</a> to enable web search.
          </p>
          <input
            type="password"
            class="mt-1 ui-input"
            placeholder="tvly-..."
            value={tavily.value()}
            onInput={(e) => tavily.setValue(e.currentTarget.value)}
          />
        </label>
        <Show when={tavily.dirty() || tavily.saved()}>
          <button class="btn-primary" onClick={tavily.save}>
            {tavily.saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>

      {/* GitHub */}
      <div class="ui-subpanel p-2 space-y-2">
        <label class="block">
          <div class="flex items-center justify-between">
            <span class="text-[13px] text-gh-fg-muted flex items-center gap-1.5"><span class="i ti ti-brand-github text-sm" />GitHub</span>
            <Show when={props.onShowGitHubHelp}>
              <button class="btn-minimal" onClick={() => { haptics.tap(); props.onShowGitHubHelp?.(); }}>
                how to get a token?
              </button>
            </Show>
          </div>
          <p class="settings-desc mt-0.5">
            Personal Access Token for reading repos, issues, and PRs.
          </p>
          <input
            type="password"
            class="mt-1 ui-input"
            placeholder="ghp_..."
            value={github.value()}
            onInput={(e) => github.setValue(e.currentTarget.value)}
          />
        </label>
        <Show when={github.dirty() || github.saved()}>
          <button class="btn-primary" onClick={github.save}>
            {github.saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>

      {/* Twelve Data */}
      <div class="ui-subpanel p-2 space-y-2">
        <label class="block">
          <span class="text-[13px] text-gh-fg-muted flex items-center gap-1.5"><span class="i ti ti-chart-line text-sm" />Twelve Data</span>
          <p class="settings-desc mt-0.5">
            Stock market data. Get a free API key at <a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">twelvedata.com</a>.
          </p>
          <input
            type="password"
            class="mt-1 ui-input"
            placeholder="API key"
            value={twelvedata.value()}
            onInput={(e) => twelvedata.setValue(e.currentTarget.value)}
          />
        </label>
        <Show when={twelvedata.dirty() || twelvedata.saved()}>
          <button class="btn-primary" onClick={twelvedata.save}>
            {twelvedata.saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>

      {/* Nextcloud */}
      <div class="ui-subpanel p-2 space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-[13px] text-gh-fg-muted flex items-center gap-1.5"><span class="i ti ti-brand-nextcloud text-sm" />Nextcloud</div>
          <Show when={props.onShowNextcloudHelp}>
            <button class="btn-minimal" onClick={() => { haptics.tap(); props.onShowNextcloudHelp?.(); }}>
              how to get an app password?
            </button>
          </Show>
        </div>
        <p class="settings-desc">
          Connect your Nextcloud for file access, calendar events, and Talk messages.
          The assistant can read all files, create new files, and manage calendar events — but cannot modify or delete existing files.
        </p>
        <input
          type="text"
          class="ui-input"
          placeholder="https://cloud.example.com"
          value={nc.config().url ?? ""}
          onInput={(e) => nc.update("url", e.currentTarget.value)}
        />
        <input
          type="text"
          class="ui-input"
          placeholder="username"
          value={nc.config().user ?? ""}
          onInput={(e) => nc.update("user", e.currentTarget.value)}
        />
        <input
          type="password"
          class="ui-input"
          placeholder="app password"
          value={nc.config().appPassword ?? ""}
          onInput={(e) => nc.update("appPassword", e.currentTarget.value)}
        />
        <Show when={nc.dirty() || nc.saved()}>
          <button class="btn-primary" onClick={nc.save}>
            {nc.saved() ? "saved!" : "save"}
          </button>
        </Show>
      </div>

    </div>
  );
};
