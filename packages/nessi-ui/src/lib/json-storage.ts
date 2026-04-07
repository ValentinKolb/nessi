/** Read JSON from localStorage with a safe fallback. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage. */
export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Read a plain string from localStorage with fallback. */
export function readString(key: string, fallback = ""): string {
  return localStorage.getItem(key) ?? fallback;
}

/** Write a plain string to localStorage. */
export function writeString(key: string, value: string): void {
  localStorage.setItem(key, value);
}

/** Remove a localStorage key. */
export function removeKey(key: string): void {
  localStorage.removeItem(key);
}
