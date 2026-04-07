import { createSignal, onCleanup } from "solid-js";

/** Reactive copy-to-clipboard action with auto-resetting `copied` signal. */
export function createCopyAction(timeout = 2000) {
  const [copied, setCopied] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setCopied(false), timeout);
  }

  return { copy, copied };
}
