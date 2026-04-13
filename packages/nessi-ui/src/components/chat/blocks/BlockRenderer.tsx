import { Show, type Component } from "solid-js";
import type { UIBlock } from "../types.js";
import { TextBlock } from "./TextBlock.js";
import { ToolCallBlock } from "./ToolCallBlock.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { SurveyBlock } from "./SurveyBlock.js";
import { ApprovalBlock } from "./ApprovalBlock.js";
import { CompactionBlock } from "./CompactionBlock.js";

export type BlockProps = {
  block: UIBlock | { type: string; [key: string]: unknown };
  chatId?: string;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
  onSurveySubmit?: (callId: string, answers: Record<string, string>) => void;
};

const renderers: Record<string, Component<BlockProps>> = {
  text: TextBlock as Component<BlockProps>,
  tool_call: ToolCallBlock as Component<BlockProps>,
  thinking: ThinkingBlock as Component<BlockProps>,
  survey: SurveyBlock as Component<BlockProps>,
  approval: ApprovalBlock as Component<BlockProps>,
  compaction: CompactionBlock as Component<BlockProps>,
};

/** Dispatch a UI block to its matching renderer component. */
export const BlockRenderer = (props: BlockProps) => {
  const Comp = () => renderers[props.block.type];
  return (
    <Show when={Comp()} fallback={<div class="text-xs text-gh-fg-subtle">[unknown block: {props.block.type}]</div>}>
      {(C) => {
        const Component = C();
        return <Component block={props.block} chatId={props.chatId} onApproval={props.onApproval} onSurveySubmit={props.onSurveySubmit} />;
      }}
    </Show>
  );
};
