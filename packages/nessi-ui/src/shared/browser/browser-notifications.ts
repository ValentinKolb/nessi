import { localStorageJson } from "../storage/local-storage.js";

const NOTIFICATION_ASKED_KEY = "nessi:notifications:asked";

export type BrowserNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
};

export type BrowserNotificationStatus =
  | "unsupported"
  | "enabled"
  | "default"
  | "blocked";

const isSupported = () =>
  typeof window !== "undefined" && typeof Notification !== "undefined";

const permission = () => (isSupported() ? Notification.permission : "denied");

const loadAsked = () =>
  isSupported() && localStorageJson.readString(NOTIFICATION_ASKED_KEY, "") === "1";

const markAsked = () => {
  localStorageJson.writeString(NOTIFICATION_ASKED_KEY, "1");
};

const getStatus = (): BrowserNotificationStatus => {
  if (!isSupported()) return "unsupported";
  if (permission() === "granted") return "enabled";
  if (permission() === "denied") return "blocked";
  return "default";
};

const shouldShowStartupPrompt = () =>
  isSupported() && !loadAsked() && permission() === "default";

const canNotify = () =>
  getStatus() === "enabled";

const requestAccess = async () => {
  if (!isSupported()) return "unsupported" as const;

  markAsked();
  return Notification.requestPermission();
};

const dismissPrompt = () => {
  markAsked();
};

const notify = (payload: BrowserNotificationPayload) => {
  if (!canNotify()) return null;

  return new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: "/favicon-notification.png",
  });
};

export const browserNotifications = {
  isSupported,
  permission,
  getStatus,
  loadAsked,
  markAsked,
  shouldShowStartupPrompt,
  canNotify,
  requestAccess,
  dismissPrompt,
  notify,
} as const;
