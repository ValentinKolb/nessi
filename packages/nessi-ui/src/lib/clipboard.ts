import { clipboard } from "@valentinkolb/stdlib/solid";
import { haptics } from "../shared/browser/haptics.js";

/** Reactive copy-to-clipboard action with auto-resetting `copied` signal. */
export const createCopyAction = (timeout = 2000) => {
  const { copy: rawCopy, wasCopied: copied } = clipboard.create(timeout);
  const copy = async (text: string) => { await rawCopy(text); haptics.success(); };
  return { copy, copied };
};
