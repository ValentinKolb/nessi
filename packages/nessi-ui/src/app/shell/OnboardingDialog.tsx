import { createSignal, For, Show } from "solid-js";
import { readString, writeString } from "../../lib/json-storage.js";
import { loadProviders } from "../../lib/provider.js";
import { browserNotifications } from "../../shared/browser/browser-notifications.js";
import { haptics } from "../../shared/browser/haptics.js";

const ONBOARD_KEY = "nessi:onboard-version";
const CURRENT_VERSION = "0.0.3";

export const shouldShowOnboarding = () => {
  const seen = readString(ONBOARD_KEY);
  return seen !== CURRENT_VERSION;
};

export const isFirstVisit = () => readString(ONBOARD_KEY) === null;

const markOnboardingSeen = () => writeString(ONBOARD_KEY, CURRENT_VERSION);

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

export const OnboardingDialog = (props: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) => {
  const [step, setStep] = createSignal(0);

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

  const openSettingsFromGuide = () => {
    haptics.tap();
    finish();
    props.onOpenSettings();
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

  const steps: Step[] = [
    {
      id: "welcome",
      title: "Welcome to nessi",
      subtitle: "A local-first assistant that runs entirely in your browser",
      render: () => (
        <div class="space-y-3">
          <div class="space-y-1">
            <div class="ui-subpanel p-3.5 space-y-1.5">
              <div class="flex items-center gap-2 text-[14px] text-gh-fg">
                <span class="i ti ti-cpu text-lg text-gh-fg-subtle" />
                <span class="font-medium">Built for smaller, local models</span>
              </div>
              <p class="text-[13px] text-gh-fg-muted leading-relaxed">
                nessi is designed to work great with open-source models like Gemma 4 26B, Qwen 3.5 27B, or Llama 3 running on your own hardware. Cloud providers work too.
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
            { icon: "ti-help", text: "New welcome guide — onboarding, startup guidance, and /help now point to the same step-by-step intro" },
            { icon: "ti-device-mobile-vibration", text: "Haptics — subtle feedback for taps, saves, approvals, sends, and other important UI interactions on supported devices" },
            { icon: "ti-sparkles-2", text: "Provider setup polish — cleaner selector, provider icons, and a dedicated editor with better guidance" },
            { icon: "ti-clock-play", text: "Background tasks — chat suggestions plus manual triggers and logs directly in settings" },
            { icon: "ti-fold", text: "Smarter compaction — keeps full conversation loops and exposes all important settings and prompt controls" },
            { icon: "ti-brain", text: "Prompt and memory improvements — rewritten system prompt plus more automatic background memory handling" },
            { icon: "ti-code", text: "Code blocks — language headers with copy button" },
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
                await browserNotifications.requestAccess();
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
      title: "One more thing",
      subtitle: "You need an AI model to start chatting",
      condition: () => loadProviders().length === 0,
      render: () => (
        <div class="ui-subpanel p-4 space-y-3">
          <p class="text-[13px] text-gh-fg-muted leading-relaxed">
            nessi needs at least one LLM provider to work. You can connect a local model running on your machine, or use a cloud API.
          </p>
          <div class="grid grid-cols-2 gap-2 text-[13px]">
            <div class="flex items-center gap-2 text-gh-fg-muted">
              <span class="i ti ti-server text-base text-gh-fg-subtle" />
              <span>Ollama (local)</span>
            </div>
            <div class="flex items-center gap-2 text-gh-fg-muted">
              <span class="i ti ti-server-bolt text-base text-gh-fg-subtle" />
              <span>vLLM (local)</span>
            </div>
            <div class="flex items-center gap-2 text-gh-fg-muted">
              <span class="i ti ti-brand-openai text-base text-gh-fg-subtle" />
              <span>OpenAI</span>
            </div>
            <div class="flex items-center gap-2 text-gh-fg-muted">
              <span class="i ti ti-route text-base text-gh-fg-subtle" />
              <span>OpenRouter</span>
            </div>
          </div>
        </div>
      ),
      renderActions: () => (
        <div class="flex items-center gap-2">
          <BackButton />
          <button class="btn-secondary" onClick={() => { haptics.tap(); nextStep(); }}>
            skip for now
          </button>
          <button class="btn-primary" onClick={openSettingsFromGuide}>
            <span class="flex items-center gap-1.5">
              <span class="i ti ti-settings text-sm" />
              open settings
            </span>
          </button>
        </div>
      ),
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,23,30,0.22)] px-4 py-6"
        onClick={() => { haptics.tap(); finish(); }}
      >
        <div
          class="flex h-[min(90vh,35rem)] w-[min(32rem,92vw)] flex-col overflow-hidden rounded-xl border border-gh-border-muted bg-gh-surface shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <Show when={!currentStep()?.hideHeader}>
            <div class="shrink-0 border-b border-gh-border-muted px-6 py-4 text-center">
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
