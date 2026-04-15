import { createSignal, For, Show } from "solid-js";
import { readString, writeString } from "../../lib/json-storage.js";
import { loadProviders } from "../../lib/provider.js";
import { browserNotifications } from "../../shared/browser/browser-notifications.js";

const ONBOARD_KEY = "nessi:onboard-version";
const CURRENT_VERSION = "0.0.2";

export const shouldShowOnboarding = () => {
  const seen = readString(ONBOARD_KEY);
  return seen !== CURRENT_VERSION;
};

export const isFirstVisit = () => readString(ONBOARD_KEY) === null;

const markOnboardingSeen = () => writeString(ONBOARD_KEY, CURRENT_VERSION);

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

type Step = {
  id: string;
  condition?: () => boolean;
  render: () => any;
};

const Link = (props: { href: string; children: any }) => (
  <a href={props.href} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">{props.children}</a>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OnboardingDialog = (props: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) => {
  const [step, setStep] = createSignal(0);

  const steps: Step[] = [
    // ── Step 1: Welcome ──
    {
      id: "welcome",
      render: () => (
        <div>
          <div class="text-center space-y-2 pt-2 mb-4">
            <div class="flex items-center justify-center gap-2.5">
              <img src="/logo.svg" alt="nessi" class="h-7 w-7" />
              <span class="text-2xl font-bold tracking-tight">nessi</span>
            </div>
            <p class="text-[15px] text-gh-fg-muted leading-relaxed max-w-md mx-auto">
              A personal assistant that runs entirely in your browser.
              No server, no cloud — your data stays on your device.
            </p>
          </div>

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

    // ── Step 2: How it works ──
    {
      id: "how-it-works",
      render: () => (
        <div>
          <div class="text-center pt-1 mb-4">
            <h3 class="text-[16px] font-semibold">How nessi works</h3>
            <p class="text-[13px] text-gh-fg-subtle mt-0.5">A quick overview for curious minds</p>
          </div>

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

          <div class="ui-subpanel p-3.5 space-y-1.5">
            <div class="flex items-center gap-2 text-[14px] text-gh-fg">
              <span class="i ti ti-terminal text-lg text-gh-fg-subtle" />
              <span class="font-medium">In-browser Bash</span>
            </div>
            <p class="text-[13px] text-gh-fg-muted leading-relaxed">
              Instead of rigid, single-purpose tools, nessi's skills run as bash commands in a virtual shell inside your browser. AI models are naturally fluent in bash and can chain commands with pipes and logic — one flexible tool instead of dozens of specialized ones, which also saves tokens.
            </p>
            <p class="text-[12px] text-gh-fg-subtle leading-relaxed">
              Powered by <Link href="https://github.com/nicolo-ribaudo/just-bash">just-bash</Link> — a virtual bash environment with an in-memory filesystem, designed for AI agents.
            </p>
          </div>
          </div>
        </div>
      ),
    },

    // ── Step 3: What's new (only for returning users) ──
    {
      id: "whats-new",
      condition: () => !isFirstVisit(),
      render: () => (
        <div>
          <div class="text-center pt-1 mb-4">
            <h3 class="text-[16px] font-semibold">What's new in v{CURRENT_VERSION}</h3>
          </div>

          <div class="space-y-2">
            {([
              { icon: "ti-brain", text: "Rewritten system prompt — optimized for smaller models, less noise, more action" },
              { icon: "ti-fold", text: "Smarter compaction — keeps full conversation loops instead of individual messages" },
              { icon: "ti-adjustments", text: "More configurable — compaction prompt, all parameters editable in settings" },
              { icon: "ti-sparkles-2", text: "Provider editor — dedicated page with labels, help text, and provider-specific guidance" },
              { icon: "ti-code", text: "Code blocks — language headers with copy button" },
              { icon: "ti-notebook", text: "Background agent — now handles all memory management automatically" },
            ] as const).map((item) => (
              <div class="flex items-start gap-2.5 px-1">
                <span class={`i ti ${item.icon} text-base text-gh-fg-subtle mt-0.5 shrink-0`} />
                <span class="text-[13px] text-gh-fg-muted leading-relaxed">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },

    // ── Step 4: Notifications (conditional) ──
    {
      id: "notifications",
      condition: () => browserNotifications.shouldShowStartupPrompt(),
      render: () => (
        <div>
          <div class="text-center pt-1 mb-4">
            <h3 class="text-[16px] font-semibold">Stay in the loop</h3>
          </div>

          <div class="ui-subpanel p-4 space-y-3 text-center">
            <span class="i ti ti-bell text-2xl text-gh-fg-subtle" />
            <p class="text-[13px] text-gh-fg-muted leading-relaxed max-w-sm mx-auto">
              nessi can send you a small browser notification when a reply is ready and you're in another tab. Nothing else — no tracking, no spam.
            </p>
            <div class="flex justify-center gap-2 pt-1">
              <button class="btn-secondary" onClick={() => { browserNotifications.dismissPrompt(); nextStep(); }}>
                maybe later
              </button>
              <button class="btn-primary" onClick={() => { void browserNotifications.requestAccess(); nextStep(); }}>
                <span class="flex items-center gap-1.5">
                  <span class="i ti ti-bell-ringing text-sm" />
                  enable notifications
                </span>
              </button>
            </div>
          </div>
        </div>
      ),
    },

    // ── Step 5: Get started (conditional) ──
    {
      id: "get-started",
      condition: () => loadProviders().length === 0,
      render: () => (
        <div>
          <div class="text-center pt-1 mb-4">
            <h3 class="text-[16px] font-semibold">One more thing</h3>
            <p class="text-[13px] text-gh-fg-subtle mt-0.5">You need an AI model to start chatting</p>
          </div>

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
            <div class="flex justify-center pt-1">
              <button class="btn-primary" onClick={() => { finish(); props.onOpenSettings(); }}>
                <span class="flex items-center gap-1.5">
                  <span class="i ti ti-settings text-sm" />
                  open settings
                </span>
              </button>
            </div>
          </div>
        </div>
      ),
    },

    // ── Step 6: Have fun ──
    {
      id: "have-fun",
      render: () => (
        <div>
          <div class="text-center pt-2 space-y-3">
            <span class="i ti ti-rocket text-3xl text-gh-fg-subtle" />
            <h3 class="text-[16px] font-semibold">You're all set!</h3>
            <p class="text-[14px] text-gh-fg-muted leading-relaxed max-w-sm mx-auto">
              Don't panic — and remember to bring a towel.
            </p>
            <p class="text-[12px] text-gh-fg-subtle leading-relaxed max-w-xs mx-auto">
              You can reopen this guide anytime with <code class="bg-gh-overlay px-1 rounded text-[11px]">/help</code> or the <span class="i ti ti-help text-[11px]" /> button.
            </p>
          </div>

          <div class="flex justify-center pt-2">
            <button class="btn-primary" onClick={finish}>
              <span class="flex items-center gap-1.5">
                <span class="i ti ti-message text-sm" />
                start chatting
              </span>
            </button>
          </div>
        </div>
      ),
    },
  ];

  const activeSteps = () => steps.filter((s) => !s.condition || s.condition());
  const currentStep = () => activeSteps()[step()];
  const totalSteps = () => activeSteps().length;
  const isLast = () => step() >= totalSteps() - 1;
  const isFirst = () => step() === 0;

  const nextStep = () => {
    if (isLast()) { finish(); return; }
    setStep((s) => s + 1);
  };

  const prevStep = () => {
    if (!isFirst()) setStep((s) => s - 1);
  };

  const finish = () => {
    markOnboardingSeen();
    setStep(0);
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,23,30,0.22)] px-4 py-6"
        onClick={finish}
      >
        <div
          class="w-[min(32rem,92vw)] max-h-[min(92vh,48rem)] overflow-y-auto hide-scrollbar rounded-xl border border-gh-border-muted bg-gh-surface p-6 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Content */}
          {currentStep()?.render()}

          {/* Navigation */}
          <Show when={currentStep()?.id !== "notifications"}>
            <div class="flex items-center justify-between mt-5 pt-5 border-t border-gh-border-muted">
              {/* Dots */}
              <div class="flex items-center gap-1.5">
                <For each={activeSteps()}>
                  {(_, i) => (
                    <div
                      class={`h-1.5 rounded-full transition-all ${
                        i() === step() ? "w-4 bg-gh-accent" : "w-1.5 bg-gh-border-muted"
                      }`}
                    />
                  )}
                </For>
              </div>

              {/* Buttons */}
              <div class="flex items-center gap-2">
                <Show when={!isFirst()}>
                  <button class="btn-secondary" onClick={prevStep}>back</button>
                </Show>
                <Show when={!isLast()}>
                  <button class="btn-primary" onClick={nextStep}>
                    <span class="flex items-center gap-1">next <span class="i ti ti-arrow-right text-sm" /></span>
                  </button>
                </Show>
                <Show when={isLast()}>
                  <button class="btn-primary" onClick={finish}>done</button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};
