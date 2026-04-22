import type { UIPresentBlock } from "../types.js";
import { PresentContent } from "./PresentContent.js";

/** Thin block-level wrapper around PresentContent so inline tool results route through BlockRenderer. */
export const PresentBlock = (props: { block: UIPresentBlock; chatId?: string }) => (
  <PresentContent result={props.block.result} chatId={props.chatId} />
);
