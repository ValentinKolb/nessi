import { notifications } from "@valentinkolb/stdlib/browser";
import { localStorageJson } from "../storage/local-storage.js";

const NOTIFICATION_ASKED_KEY = "nessi:notifications:asked";

export type BrowserNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  onClick?: () => void;
};

export type BrowserNotificationStatus =
  | "unsupported"
  | "enabled"
  | "default"
  | "blocked";

const loadAsked = () =>
  notifications.isSupported() && localStorageJson.readString(NOTIFICATION_ASKED_KEY, "") === "1";

const markAsked = () => {
  localStorageJson.writeString(NOTIFICATION_ASKED_KEY, "1");
};

const getStatus = (): BrowserNotificationStatus => {
  if (!notifications.isSupported()) return "unsupported";
  const perm = notifications.getPermission();
  if (perm === "granted") return "enabled";
  if (perm === "denied") return "blocked";
  return "default";
};

const shouldShowStartupPrompt = () =>
  notifications.isSupported() && !loadAsked() && notifications.getPermission() === "default";

const canNotify = () =>
  notifications.getPermission() === "granted";

const requestAccess = async () => {
  if (!notifications.isSupported()) return false;
  markAsked();
  return notifications.requestPermission();
};

const dismissPrompt = () => {
  markAsked();
};

const notify = (payload: BrowserNotificationPayload) => {
  if (!canNotify()) return null;

  return notifications.show({
    title: payload.title,
    body: payload.body ?? "",
    tag: payload.tag,
    icon: "/favicon-notification.png",
    onClick: payload.onClick,
  });
};

export const browserNotifications = {
  isSupported: notifications.isSupported,
  getStatus,
  loadAsked,
  markAsked,
  shouldShowStartupPrompt,
  canNotify,
  requestAccess,
  dismissPrompt,
  notify,
} as const;
