import { createSignal, onCleanup } from "solid-js";
import { haptics } from "../shared/browser/haptics.js";

/** Reactive copy-to-clipboard action with auto-resetting `copied` signal. */
export const createCopyAction = (timeout = 2000) => {
  const [copied, setCopied] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    haptics.success();
    setCopied(true);
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setCopied(false), timeout);
  };

  return { copy, copied };
};
