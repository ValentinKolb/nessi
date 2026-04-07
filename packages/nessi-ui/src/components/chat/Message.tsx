import { For, Show } from "solid-js";
import type { UIMessage, UIUserMessage, UIAssistantMessage } from "./types.js";
import { BlockRenderer } from "./blocks/BlockRenderer.js";
import { UserBubble } from "./UserBubble.js";
import { AssistantActions } from "./message-actions/AssistantActions.js";

function isUserMessage(message: UIMessage): message is UIUserMessage {
  return message.role === "user";
}

function isAssistantMessage(message: UIMessage): message is UIAssistantMessage {
  return message.role === "assistant";
}

/** Render one chat message row (user bubble or assistant block list). */
export function Message(props: {
  message: UIMessage;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
}) {
  const userMessage = () => (isUserMessage(props.message) ? props.message : null);
  const assistantMessage = () => (isAssistantMessage(props.message) ? props.message : null);

  return (
    <div class="px-3 py-2">
      <Show when={userMessage()}>
        {(msg) => <UserBubble content={msg().content} timestamp={msg().timestamp} showMeta />}
      </Show>
      <Show when={assistantMessage()}>
        {(msg) => (
          <div class="space-y-2">
            <For each={msg().blocks}>
              {(block) => (
                <BlockRenderer
                  block={block}
                  onApproval={props.onApproval}
                  onSurveySubmit={props.onSurveySubmit}
                />
              )}
            </For>
            <Show when={!msg().streaming}>
              <AssistantActions message={msg()} />
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
