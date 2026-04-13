import { For, Show } from "solid-js";
import type { UIMessage, UIAssistantMessage } from "./types.js";
import { isUserMessage, isAssistantMessage } from "./guards.js";
import { BlockRenderer } from "./blocks/BlockRenderer.js";
import { UserBubble } from "./UserBubble.js";
import { AssistantActions } from "./message-actions/AssistantActions.js";

const hasAssistantText = (message: UIAssistantMessage) =>
  message.blocks.some((block) => block.type === "text" || block.type === "thinking");

/** Render one chat message row (user bubble or assistant block list). */
export const Message = (props: {
  chatId: string;
  message: UIMessage;
  canRetryLastUserMessage?: boolean;
  onRetryLastUserMessage?: () => void;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
}) => {
  const userMessage = () => (isUserMessage(props.message) ? props.message : null);
  const assistantMessage = () => (isAssistantMessage(props.message) ? props.message : null);

  return (
    <div class="px-3 py-2">
      <Show when={userMessage()}>
        {(msg) => (
          <UserBubble
            content={msg().content}
            timestamp={msg().timestamp}
            showMeta
            canRetry={props.canRetryLastUserMessage}
            onRetry={props.onRetryLastUserMessage}
          />
        )}
      </Show>
      <Show when={assistantMessage()}>
        {(msg) => (
          <div class="space-y-0.5">
            <For each={msg().blocks}>
              {(block) => (
                <BlockRenderer
                  block={block}
                  chatId={props.chatId}
                  onApproval={props.onApproval}
                  onSurveySubmit={props.onSurveySubmit}
                />
              )}
            </For>
            <Show when={!msg().streaming && hasAssistantText(msg())}>
              <AssistantActions message={msg()} />
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};
