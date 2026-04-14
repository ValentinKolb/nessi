const ICON_SELECTOR = "link[rel~='icon']";

let defaultHref = "/favicon.png";
let active = false;

const iconLink = () => document.querySelector<HTMLLinkElement>(ICON_SELECTOR);

const ensureDefaultHref = () => {
  const href = iconLink()?.getAttribute("href");
  if (href) defaultHref = href;
};

const setFavicon = (href: string) => {
  let link = iconLink();
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  link.href = href;
};

const init = () => {
  ensureDefaultHref();
};

const markUnread = () => {
  ensureDefaultHref();
  active = true;
  setFavicon("/favicon-notification.png");
};

const clear = () => {
  if (!active) return;
  active = false;
  setFavicon(defaultHref);
};

export const pageAttention = {
  init,
  markUnread,
  clear,
} as const;
