import { createSignal } from "solid-js";
import { localStorageJson } from "../storage/local-storage.js";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "nessi:theme";

const getSystemPreference = (): "light" | "dark" =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const resolveTheme = (mode: ThemeMode): "light" | "dark" =>
  mode === "system" ? getSystemPreference() : mode;

const applyTheme = (resolved: "light" | "dark") => {
  document.documentElement.classList.toggle("dark", resolved === "dark");

  // Update meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0c0c0e" : "#f6f8fa");
};

// Read persisted preference (fallback: light)
const stored = localStorageJson.read<ThemeMode>(STORAGE_KEY, "light");
const [mode, setMode] = createSignal<ThemeMode>(stored);

// Apply immediately on module load (before first render)
applyTheme(resolveTheme(stored));

// React to OS-level theme changes when mode is "system"
const mql = window.matchMedia("(prefers-color-scheme: dark)");
mql.addEventListener("change", () => {
  if (mode() === "system") applyTheme(resolveTheme("system"));
});

export const theme = {
  /** Current user preference: "light" | "dark" | "system" */
  mode,
  /** Resolved value after applying system preference */
  resolved: () => resolveTheme(mode()),
  /** Update theme and persist */
  setMode: (next: ThemeMode) => {
    setMode(next);
    localStorageJson.write(STORAGE_KEY, next);
    applyTheme(resolveTheme(next));
  },
} as const;
