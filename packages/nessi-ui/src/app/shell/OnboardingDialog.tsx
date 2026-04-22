import { createSignal, For, Show } from "solid-js";
import { humanId } from "human-id";
import { localStorageJson } from "../../shared/storage/local-storage.js";
import {
  getProviderPresets,
  getProviderIconUrl,
  loadProviders,
  saveProviders,
  setActiveProviderId,
  validateProviderEntry,
  type ProviderEntry,
  type ProviderType,
} from "../../lib/provider.js";
import { browserNotifications } from "../../shared/browser/browser-notifications.js";
import { haptics } from "../../shared/browser/haptics.js";
import { theme, type ThemeMode } from "../../shared/theme/theme.js";

const ONBOARD_KEY = "nessi:onboard-version";
const CURRENT_VERSION = "0.0.4";

export const shouldShowOnboarding = () => {
  const seen = localStorageJson.readString(ONBOARD_KEY);
  return seen !== CURRENT_VERSION;
};

export const isFirstVisit = () => localStorageJson.readString(ONBOARD_KEY) === null;

const markOnboardingSeen = () => localStorageJson.writeString(ONBOARD_KEY, CURRENT_VERSION);

type Step = {
  id: string;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
  condition?: () => boolean;
  render: () => any;
  renderActions?: () => any;
};

const Link = (props: { href: string; children: any }) => (
  <a href={props.href} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">{props.children}</a>
);

const PRESETS = getProviderPresets();

export const OnboardingDialog = (props: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) => {
  const [step, setStep] = createSignal(0, { equals: false });

  const activeSteps = () => steps.filter((entry) => !entry.condition || entry.condition());
  const currentStep = () => activeSteps()[step()];
  const totalSteps = () => activeSteps().length;
  const isLast = () => step() >= totalSteps() - 1;
  const isFirst = () => step() === 0;

  const finish = () => {
    markOnboardingSeen();
    setStep(0);
    props.onClose();
  };

  const nextStep = () => {
    if (isLast()) {
      finish();
      return;
    }
    setStep((value) => value + 1);
  };

  const prevStep = () => {
    if (!isFirst()) setStep((value) => value - 1);
  };

  const goToStep = (index: number) => {
    if (index === step()) return;
    haptics.tap();
    setStep(index);
  };

  const advanceAfter = (stepId: string) => {
    const currentIndex = steps.findIndex((entry) => entry.id === stepId);
    if (currentIndex < 0) {
      nextStep();
      return;
    }

    const nextVisible = steps
      .slice(currentIndex + 1)
      .find((entry) => !entry.condition || entry.condition());

    if (!nextVisible) {
      finish();
      return;
    }

    const nextIndex = activeSteps().findIndex((entry) => entry.id === nextVisible.id);
    if (nextIndex < 0) {
      finish();
      return;
    }
    setStep(nextIndex);
  };

  const BackButton = () => (
    <Show when={!isFirst()}>
      <button
        class="inline-flex items-center justify-center p-1 text-gh-fg-subtle transition-colors hover:text-gh-fg"
        onClick={() => { haptics.tap(); prevStep(); }}
        aria-label="Back"
      >
        <span class="i ti ti-arrow-left text-sm" />
      </button>
    </Show>
  );

  /* ── Provider step state (shared between render + renderActions) ── */
  const [providerMode, setProviderMode] = createSignal<"editor" | "import">("editor");
  const [providerDraft, setProviderDraft] = createSignal<ProviderEntry>({
    id: humanId({ separator: "-", capitalize: false }),
    type: "openai-compatible",
    name: "",
    baseURL: "http://localhost:11434/v1",
    model: "",
    toolCallIdPolicy: "passthrough",
  });
  const [providerImportText, setProviderImportText] = createSignal("");
  const [providerError, setProviderError] = createSignal("");

  const updateProviderField = (field: keyof ProviderEntry, value: string) => {
    setProviderDraft((prev) => ({ ...prev, [field]: value }));
    if (providerError()) setProviderError("");
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      setProviderDraft((prev) => ({ ...prev, type: presetId as ProviderType }));
      return;
    }
    setProviderDraft((prev) => ({
      ...prev,
      type: preset.defaults.type,
      name: prev.name.trim() ? prev.name : preset.defaults.name,
      baseURL: preset.defaults.baseURL,
      model: prev.model.trim() ? prev.model : preset.defaults.model,
      toolCallIdPolicy: preset.defaults.toolCallIdPolicy,
    }));
  };

  const saveProvider = () => {
    const d = providerDraft();
    if (providerMode() === "import") {
      // Import mode
      const raw = providerImportText();
      let entry: ProviderEntry | null = null;
      try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        if (!o || typeof o.name !== "string" || typeof o.model !== "string") throw new Error();
        entry = {
          id: humanId({ separator: "-", capitalize: false }),
          type: typeof o.type === "string" ? o.type as ProviderType : "openai-compatible",
          name: o.name,
          baseURL: (o.baseURL as string) ?? "http://localhost:11434/v1",
          model: o.model,
          apiKey: (o.apiKey as string) ?? undefined,
          toolCallIdPolicy: o.toolCallIdPolicy === "strict9" ? "strict9" : "passthrough",
        };
      } catch {
        setProviderError("Invalid JSON. Must contain at least name and model.");
        haptics.error();
        return;
      }
      const list = [...loadProviders(), entry];
      saveProviders(list);
      setActiveProviderId(entry.id);
      haptics.success();
      advanceAfter("get-started");
      return;
    }

    // Editor mode
    const validationError = validateProviderEntry(d);
    if (validationError) {
      setProviderError(validationError);
      haptics.error();
      return;
    }
    const list = [...loadProviders(), d];
    saveProviders(list);
    setActiveProviderId(d.id);
    haptics.success();
    advanceAfter("get-started");
  };

  const steps: Step[] = [
    {
      id: "welcome",
      title: "Welcome to nessi",
      subtitle: "A local-first assistant that stores all your data on your device",
      render: () => (
        <div class="space-y-3">
          <div class="space-y-1">
            <div class="ui-subpanel p-3.5 space-y-1.5">
              <div class="flex items-center gap-2 text-[14px] text-gh-fg">
                <span class="i ti ti-cpu text-lg text-gh-fg-subtle" />
                <span class="font-medium">Built for all models - small to large</span>
              </div>
              <p class="text-[13px] text-gh-fg-muted leading-relaxed">
                nessi is designed to work great with open-source models like Gemma 4 26B, Qwen 3.5 27B, or Llama 3 running on your own hardware. Of course, cloud providers work too.
              </p>
            </div>

            <div class="ui-subpanel p-3.5 space-y-1.5">
              <div class="flex items-center gap-2 text-[14px] text-gh-fg">
                <span class="i ti ti-adjustments text-lg text-gh-fg-subtle" />
                <span class="font-medium">Everything is configurable</span>
              </div>
              <p class="text-[13px] text-gh-fg-muted leading-relaxed">
                System prompt, skills, memory, compaction, background agents — you control every aspect of how nessi works.
              </p>
            </div>

            <div class="ui-subpanel p-3.5 space-y-1.5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-[14px] text-gh-fg">
                  <span class="i ti ti-brand-github text-lg text-gh-fg-subtle" />
                  <span class="font-medium">Open source</span>
                </div>
                <Link href="https://github.com/ValentinKolb/nessi">
                  <span class="text-[13px]">github.com/ValentinKolb/nessi</span>
                </Link>
              </div>
              <p class="text-[13px] text-gh-fg-muted leading-relaxed">
                nessi is a showcase for <Link href="https://github.com/ValentinKolb/nessi">nessi-ai</Link>, a minimal agent stack for building LLM-powered apps. If you like it, a <span class="i ti ti-star text-[12px]" /> on the repo would mean a lot!
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "how-it-works-models",
      title: "How nessi works",
      subtitle: "Models, providers, and tools",
      render: () => (
        <div class="space-y-1">
          <div class="ui-subpanel p-3.5 space-y-1.5">
            <div class="flex items-center gap-2 text-[14px] text-gh-fg">
              <span class="i ti ti-brain text-lg text-gh-fg-subtle" />
              <span class="font-medium">Models & Providers</span>
            </div>
            <p class="text-[13px] text-gh-fg-muted leading-relaxed">
              nessi connects to an AI model of your choice — running locally on your computer (via Ollama or vLLM) or in the cloud (OpenAI, Anthropic, etc.). You configure one or more providers in the settings, and nessi sends your messages to the model and receives its answers.
            </p>
          </div>

          <div class="ui-subpanel p-3.5 space-y-1.5">
            <div class="flex items-center gap-2 text-[14px] text-gh-fg">
              <span class="i ti ti-tool text-lg text-gh-fg-subtle" />
              <span class="font-medium">Tools & Skills</span>
            </div>
            <p class="text-[13px] text-gh-fg-muted leading-relaxed">
              The model can do more than just chat — it can call tools: search the web, read and write files, manage your memories, and run specialized skills like chart generation, PDF processing, or GitHub integration. The model decides <em>what</em> to do, and your browser executes it.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "how-it-works-runtime",
      title: "How nessi works",
      subtitle: "Browser runtime, approvals, and flexible skills",
      render: () => (
        <div class="space-y-1">
          <div class="ui-subpanel p-3.5 space-y-1.5">
            <div class="flex items-center gap-2 text-[14px] text-gh-fg">
              <span class="i ti ti-terminal text-lg text-gh-fg-subtle" />
              <span class="font-medium">In-browser Bash</span>
            </div>
            <p class="text-[13px] text-gh-fg-muted leading-relaxed">
              Instead of rigid, single-purpose tools, nessi&apos;s skills run as bash commands in a virtual shell inside your browser. AI models are naturally fluent in bash and can chain commands with pipes and logic — one flexible tool instead of dozens of specialized ones, which also saves tokens.
            </p>
            <p class="text-[12px] text-gh-fg-subtle leading-relaxed">
              Powered by <Link href="https://github.com/nicolo-ribaudo/just-bash">just-bash</Link> — a virtual bash environment with an in-memory filesystem, designed for AI agents.
            </p>
          </div>

          <div class="ui-subpanel p-3.5 space-y-1.5">
            <div class="flex items-center gap-2 text-[14px] text-gh-fg">
              <span class="i ti ti-shield-check text-lg text-gh-fg-subtle" />
              <span class="font-medium">You stay in control</span>
            </div>
            <p class="text-[13px] text-gh-fg-muted leading-relaxed">
              nessi can pause for approvals before sensitive actions, show structured surveys, and surface every tool step directly in the chat. The agent can act, but it does not act blindly.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "whats-new",
      title: `What's new in v${CURRENT_VERSION}`,
      condition: () => !isFirstVisit(),
      render: () => (
        <div class="space-y-2">
          {([
            { icon: "ti-terminal-2", text: "Built-in terminal — open a shell right below the chat, same environment as the agent with all skills and files" },
            { icon: "ti-brand-github", text: "GitHub integration — browse repos, attach files, issues, and PRs from a modal, plus a lazy VFS at /github/" },
            { icon: "ti-table", text: "Powerful table queries — filter, aggregate, group, sort, and alias in one command with table query" },
            { icon: "ti-chart-bar", text: "Chart from CSV — pipe table query results directly into chart commands, no manual value copying" },
            { icon: "ti-brain", text: "Improved prompts and memory — rewritten system prompt, smarter background handling, and better skill descriptions" },
            { icon: "ti-package", text: "Stdlib integration — replaced many internal utilities with @valentinkolb/stdlib for smaller bundle and less maintenance" },
            { icon: "ti-text-plus", text: "... plus dark terminal theme, haptics, background tasks, and many more improvements" },
          ] as const).map((item) => (
            <div class="flex items-start gap-2.5 px-1">
              <span class={`i ti ${item.icon} text-base text-gh-fg-subtle mt-0.5 shrink-0`} />
              <span class="text-[13px] text-gh-fg-muted leading-relaxed">{item.text}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "notifications",
      title: "Stay in the loop",
      subtitle: "Optional browser notifications for finished replies",
      condition: () => browserNotifications.shouldShowStartupPrompt(),
      render: () => (
        <div class="ui-subpanel p-4 space-y-3 text-center">
          <span class="i ti ti-bell text-2xl text-gh-fg-subtle" />
          <p class="text-[13px] text-gh-fg-muted leading-relaxed max-w-sm mx-auto">
            nessi can send you a small browser notification when a reply is ready and you&apos;re in another tab. Nothing else — no tracking, no spam.
          </p>
        </div>
      ),
      renderActions: () => {
        const stepId = "notifications";
        return (
          <div class="flex items-center gap-2">
            <BackButton />
            <button
              class="btn-secondary"
              onClick={() => {
                haptics.tap();
                browserNotifications.dismissPrompt();
                advanceAfter(stepId);
              }}
            >
              maybe later
            </button>
            <button
              class="btn-primary"
              onClick={async () => {
                haptics.success();
                try { await browserNotifications.requestAccess(); } catch { /* user denied or API unavailable */ }
                browserNotifications.dismissPrompt();
                advanceAfter(stepId);
              }}
            >
              <span class="flex items-center gap-1.5">
                <span class="i ti ti-bell-ringing text-sm" />
                enable notifications
              </span>
            </button>
          </div>
        );
      },
    },
    {
      id: "get-started",
      title: "Connect a model",
      subtitle: "Add a provider to start chatting",
      condition: () => loadProviders().length === 0,
      render: () => {
        const draft = providerDraft;
        return (
          <div class="space-y-3">
            {/* Mode toggle */}
            <div class="flex gap-1.5">
              <button
                class={`flex-1 text-[12px] font-medium py-1.5 border rounded-md transition-colors ${
                  providerMode() === "editor"
                    ? "border-gh-accent bg-gh-accent-subtle text-gh-accent"
                    : "border-gh-border-muted bg-gh-surface text-gh-fg-muted hover:border-gh-border"
                }`}
                onClick={() => { haptics.tap(); setProviderMode("editor"); setProviderError(""); }}
              >
                <span class="flex items-center justify-center gap-1.5">
                  <span class="i ti ti-plus text-[11px]" /> New provider
                </span>
              </button>
              <button
                class={`flex-1 text-[12px] font-medium py-1.5 border rounded-md transition-colors ${
                  providerMode() === "import"
                    ? "border-gh-accent bg-gh-accent-subtle text-gh-accent"
                    : "border-gh-border-muted bg-gh-surface text-gh-fg-muted hover:border-gh-border"
                }`}
                onClick={() => { haptics.tap(); setProviderMode("import"); setProviderError(""); }}
              >
                <span class="flex items-center justify-center gap-1.5">
                  <span class="i ti ti-download text-[11px]" /> Import JSON
                </span>
              </button>
            </div>

            <Show when={providerError()}>
              <p class="text-[12px] text-gh-danger">{providerError()}</p>
            </Show>

            {/* Editor mode */}
            <Show when={providerMode() === "editor"}>
              <div class="space-y-3">
                {/* Provider type */}
                <div class="space-y-1">
                  <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Provider</label>
                  <div class="flex items-center gap-2">
                    <img src={getProviderIconUrl(draft().type)} alt="" class="h-5 w-5 shrink-0" />
                    <select
                      class="ui-input flex-1"
                      value={draft().type}
                      onInput={(e) => applyPreset(e.currentTarget.value)}
                    >
                      <For each={PRESETS}>
                        {(preset) => <option value={preset.id}>{preset.label}</option>}
                      </For>
                      <option value="openai-compatible">Custom OpenAI-compatible</option>
                    </select>
                  </div>
                </div>

                {/* Name & Model */}
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Name</label>
                    <input
                      class="ui-input"
                      placeholder="My Provider"
                      value={draft().name}
                      onInput={(e) => updateProviderField("name", e.currentTarget.value)}
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Model</label>
                    <input
                      class="ui-input"
                      placeholder="llama3.1"
                      value={draft().model}
                      onInput={(e) => updateProviderField("model", e.currentTarget.value)}
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
                    onInput={(e) => updateProviderField("baseURL", e.currentTarget.value)}
                  />
                </div>

                {/* API Key */}
                <div class="space-y-1">
                  <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">API Key</label>
                  <input
                    type="password"
                    class="ui-input"
                    placeholder="optional — only for cloud providers"
                    value={draft().apiKey ?? ""}
                    onInput={(e) => updateProviderField("apiKey", e.currentTarget.value)}
                  />
                </div>
              </div>
            </Show>

            {/* Import mode */}
            <Show when={providerMode() === "import"}>
              <div class="space-y-2">
                <p class="text-[12px] text-gh-fg-muted">
                  Paste a provider config JSON from someone who shared theirs.
                </p>
                <textarea
                  class="ui-input min-h-32 resize-y font-mono text-[12px]"
                  rows={6}
                  placeholder={'{\n  "name": "My Provider",\n  "type": "ollama",\n  "baseURL": "http://localhost:11434",\n  "model": "llama3.1"\n}'}
                  value={providerImportText()}
                  onInput={(e) => { setProviderImportText(e.currentTarget.value); if (providerError()) setProviderError(""); }}
                />
              </div>
            </Show>
          </div>
        );
      },
      renderActions: () => (
        <div class="flex items-center gap-2">
          <BackButton />
          <button class="btn-secondary" onClick={() => { haptics.tap(); advanceAfter("get-started"); }}>
            skip for now
          </button>
          <button class="btn-primary" onClick={saveProvider}>
            <span class="flex items-center gap-1.5">
              <span class="i ti ti-check text-sm" />
              save
            </span>
          </button>
        </div>
      ),
    },
    {
      id: "theme",
      title: "Pick your look",
      subtitle: "You can change this anytime in Settings",
      render: () => {
        const THEME_OPTIONS: { value: ThemeMode; icon: string; label: string; desc: string }[] = [
          { value: "light", icon: "ti-sun", label: "Light", desc: "Clean and bright" },
          { value: "dark", icon: "ti-terminal-2", label: "Terminal", desc: "High-contrast, sharp edges" },
          { value: "system", icon: "ti-device-desktop", label: "System", desc: "Follow your OS setting" },
        ];
        return (
          <div class="space-y-3">
            <For each={THEME_OPTIONS}>
              {(opt) => (
                <button
                  class={`w-full flex items-center gap-3 p-3.5 border transition-colors text-left rounded-md ${
                    theme.mode() === opt.value
                      ? "border-gh-accent bg-gh-accent-subtle"
                      : "border-gh-border-muted bg-gh-surface hover:border-gh-border"
                  }`}
                  onClick={() => { haptics.tap(); theme.setMode(opt.value); }}
                >
                  <span class={`i ti ${opt.icon} text-xl ${
                    theme.mode() === opt.value ? "text-gh-accent" : "text-gh-fg-subtle"
                  }`} />
                  <div>
                    <div class={`text-[14px] font-medium ${
                      theme.mode() === opt.value ? "text-gh-accent" : "text-gh-fg"
                    }`}>{opt.label}</div>
                    <div class="text-[12px] text-gh-fg-muted">{opt.desc}</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        );
      },
    },
    {
      id: "have-fun",
      hideHeader: true,
      render: () => (
        <div class="text-center pt-2 space-y-3">
          <span class="i ti ti-rocket text-3xl text-gh-fg-subtle" />
          <h3 class="text-[16px] font-semibold">You&apos;re all set!</h3>
          <p class="text-[14px] text-gh-fg-muted leading-relaxed max-w-sm mx-auto">
            Don&apos;t panic — and remember to bring a towel.
          </p>
          <p class="text-[12px] text-gh-fg-subtle leading-relaxed max-w-xs mx-auto">
            You can reopen this guide anytime with <code class="bg-gh-overlay px-1 rounded text-[11px]">/help</code> or the <span class="i ti ti-help text-[11px]" /> button.
          </p>
        </div>
      ),
    },
  ];

  return (
    <Show when={props.open}>
      <div
        class="modal-backdrop py-6"
        onClick={() => { haptics.tap(); finish(); }}
      >
        <div
          class="modal-panel flex h-[min(90vh,35rem)] w-[min(32rem,92vw)] flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <Show when={!currentStep()?.hideHeader}>
            <div class="modal-header shrink-0 px-6 py-4 text-center">
              <h3 class="text-[16px] font-semibold text-gh-fg">{currentStep()?.title}</h3>
              <Show when={currentStep()?.subtitle}>
                <p class="mt-1 text-[13px] text-gh-fg-subtle">{currentStep()?.subtitle}</p>
              </Show>
            </div>
          </Show>

          <div class={`min-h-0 flex-1 overflow-y-auto hide-scrollbar px-6 ${currentStep()?.hideHeader ? "py-8" : "py-6"}`}>
            <div class="mx-auto flex min-h-full w-full max-w-md items-center justify-center">
              <div class="w-full">
                {currentStep()?.render()}
              </div>
            </div>
          </div>

          <div class="shrink-0 border-t border-gh-border-muted px-6 py-4">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-1.5">
                <For each={activeSteps()}>
                  {(activeStep, i) => (
                    <button
                      class={`h-1.5 rounded-full transition-all ${
                        i() === step() ? "w-4 bg-gh-accent" : "w-1.5 bg-gh-border-muted hover:bg-gh-fg-subtle"
                      }`}
                      onClick={() => goToStep(i())}
                      aria-label={`Go to step ${i() + 1}: ${activeStep.id}`}
                      title={activeStep.id}
                    />
                  )}
                </For>
              </div>

              <Show
                when={currentStep()?.renderActions}
                fallback={
                  <div class="flex items-center gap-2">
                    <BackButton />
                    <Show when={!isLast()}>
                      <button class="btn-primary" onClick={() => { haptics.tap(); nextStep(); }}>
                        <span class="flex items-center gap-1">next <span class="i ti ti-arrow-right text-sm" /></span>
                      </button>
                    </Show>
                    <Show when={isLast()}>
                      <button class="btn-primary" onClick={() => { haptics.success(); finish(); }}>
                        <span class="flex items-center gap-1.5">
                          <span>let&apos;s go</span>
                          <span class="i ti ti-sparkles text-sm" />
                        </span>
                      </button>
                    </Show>
                  </div>
                }
              >
                {currentStep()?.renderActions?.()}
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
