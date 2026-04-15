import { WebHaptics } from "web-haptics";
import { settingsRepo } from "../../domains/settings/settings.repo.js";

let instance: WebHaptics | null = null;
let enabled = true;
let initPromise: Promise<void> | null = null;

const TAP_PATTERN = [{ duration: 12, intensity: 0.35 }];

const getInstance = () => {
  if (!instance) instance = new WebHaptics();
  return instance;
};

const isBrowser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const canTrigger = () => isBrowser() && enabled;

const fire = async (
  input: "success" | "nudge" | "error" | "selection" | typeof TAP_PATTERN,
) => {
  if (!canTrigger()) return false;
  try {
    await getInstance().trigger(input);
    return true;
  } catch {
    return false;
  }
};

export const haptics = {
  async init() {
    if (!initPromise) {
      initPromise = (async () => {
        enabled = await settingsRepo.getHapticsEnabled();
      })();
    }
    await initPromise;
  },

  isSupported() {
    return isBrowser();
  },

  isEnabled() {
    return enabled;
  },

  async setEnabled(next: boolean) {
    enabled = next;
    await settingsRepo.setHapticsEnabled(next);
  },

  tap() {
    void fire(TAP_PATTERN);
  },

  selection() {
    void fire("selection");
  },

  success() {
    void fire("success");
  },

  nudge() {
    void fire("nudge");
  },

  error() {
    void fire("error");
  },
} as const;
