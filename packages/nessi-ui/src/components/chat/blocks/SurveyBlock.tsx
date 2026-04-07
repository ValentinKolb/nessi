import { createSignal, For, Show } from "solid-js";
import type { UISurveyBlock } from "../types.js";

/** Interactive single-choice survey block rendered from the survey client tool. */
export function SurveyBlock(props: {
  block: UISurveyBlock;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = createSignal<Record<string, string>>({});

  const allAnswered = () =>
    props.block.questions.every((q) => answers()[q.question] !== undefined);

  function select(question: string, option: string) {
    if (props.block.submitted) return;
    setAnswers((prev) => ({ ...prev, [question]: option }));
  }

  function submit() {
    if (!allAnswered()) return;
    props.onSurveySubmit?.(props.block.callId, answers());
  }

  return (
    <div class="my-1 ui-panel text-xs overflow-hidden">
      <Show when={props.block.title}>
        <div class="px-2 py-1 bg-gh-overlay text-gh-fg-secondary font-bold">
          {props.block.title}
        </div>
      </Show>

      <div class="p-2 space-y-3">
        <For each={props.block.questions}>
          {(q) => {
            const selected = () =>
              props.block.submitted
                ? props.block.answers?.[q.question]
                : answers()[q.question];

            return (
              <div class="space-y-1">
                <div class="text-gh-fg-secondary">{q.question}</div>
                <div class="flex flex-wrap gap-1">
                  <For each={q.options}>
                    {(opt) => (
                      <button
                        class={
                          selected() === opt
                            ? "bg-zinc-900 text-zinc-50 text-xs px-2.5 py-1 cursor-pointer rounded-[0.4rem]"
                            : "btn-secondary"
                        }
                        disabled={props.block.submitted}
                        onClick={() => select(q.question, opt)}
                      >
                        {opt}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>

        <Show when={!props.block.submitted}>
          <button
            class="btn-primary"
            disabled={!allAnswered()}
            onClick={submit}
          >
            submit
          </button>
        </Show>
      </div>
    </div>
  );
}
