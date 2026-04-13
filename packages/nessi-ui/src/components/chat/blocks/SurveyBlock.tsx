import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { UISurveyBlock } from "../types.js";

/** Interactive multi-step survey block rendered from the survey client tool. */
export const SurveyBlock = (props: {
  block: UISurveyBlock;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
}) => {
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const [step, setStep] = createSignal(0);
  const [freeText, setFreeText] = createSignal("");

  const currentAnswers = createMemo(() =>
    props.block.submitted ? (props.block.answers ?? {}) : answers(),
  );

  const totalSteps = () => props.block.questions.length;
  const currentQuestion = () => props.block.questions[step()];

  createEffect(() => {
    const question = currentQuestion();
    if (!question) return;
    setFreeText("");
  });

  const commitAnswer = (value: string) => {
    const question = currentQuestion();
    if (!question || props.block.submitted) return;

    const trimmed = value.trim();
    if (!trimmed) return;

    const nextAnswers = { ...answers(), [question.question]: trimmed };
    setAnswers(nextAnswers);

    if (step() >= totalSteps() - 1) {
      props.onSurveySubmit?.(props.block.callId, nextAnswers);
      return;
    }

    setStep((current) => current + 1);
  };

  const submitFreeText = () => {
    commitAnswer(freeText());
  };

  const handleFreeTextKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitFreeText();
  };

  return (
    <div class="my-1 ui-panel overflow-hidden text-[13px]">
      <div class="flex items-start gap-3 px-3 py-2 bg-gh-muted">
        <div class="min-w-0 flex-1">
          <Show when={props.block.title}>
            <div class="font-bold text-gh-fg-secondary">{props.block.title}</div>
          </Show>
          <Show when={!props.block.submitted && currentQuestion()}>
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1 text-sm leading-snug text-gh-fg-secondary">
                {currentQuestion()?.question}
              </div>
              <Show when={totalSteps() > 0}>
                <div class="shrink-0 text-[11px] uppercase tracking-[0.1em] text-gh-fg-subtle">
                  {step() + 1}/{totalSteps()}
                </div>
              </Show>
            </div>
          </Show>
          <Show when={props.block.submitted}>
            <div class="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-gh-fg-subtle">Submitted</div>
          </Show>
        </div>
      </div>

      <div class="p-3">
        <Show
          when={!props.block.submitted && currentQuestion()}
          fallback={
            <div class="space-y-2">
              <For each={props.block.questions}>
                {(question) => (
                  <div class="space-y-1.5">
                    <div class="text-gh-fg-secondary">{question.question}</div>
                    <div class="ui-subpanel px-3 py-2 text-gh-fg-muted">
                      {props.block.answers?.[question.question] ?? answers()[question.question] ?? "No answer"}
                    </div>
                  </div>
                )}
              </For>
            </div>
          }
        >
          {(question) => (
            <div class="space-y-3">
              <div class="space-y-2">
                <For each={question().options}>
                  {(option) => (
                    <button
                      class="ui-subpanel flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gh-fg-secondary transition-colors hover:bg-gh-muted hover:text-gh-fg"
                      disabled={props.block.submitted}
                      onClick={() => commitAnswer(option)}
                    >
                      <span class="min-w-0 flex-1">{option}</span>
                      <span class="i ti ti-chevron-right text-gh-fg-subtle" />
                    </button>
                  )}
                </For>
              </div>

              <div class="ui-subpanel flex items-center gap-2 px-3 py-2">
                <input
                  class="min-w-0 flex-1 bg-transparent text-sm text-gh-fg placeholder-gh-fg-subtle outline-none"
                  placeholder="Or type your answer..."
                  value={freeText()}
                  onInput={(event) => setFreeText(event.currentTarget.value)}
                  onKeyDown={handleFreeTextKeyDown}
                />
                <button
                  class="shrink-0 text-gh-fg-subtle transition-colors hover:text-gh-fg disabled:opacity-30"
                  disabled={!freeText().trim()}
                  onClick={submitFreeText}
                >
                  <span class="i ti ti-arrow-right text-base" />
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};
