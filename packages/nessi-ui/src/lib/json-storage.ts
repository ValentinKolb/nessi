/** Read JSON from localStorage with a safe fallback. */
export const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Write JSON to localStorage. */
export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[nessi] localStorage write failed for "${key}":`, err instanceof Error ? err.message : err);
  }
};

/** Read a plain string from localStorage with fallback. */
export const readString = (key: string, fallback = "") =>
  localStorage.getItem(key) ?? fallback;

/** Write a plain string to localStorage. */
export const writeString = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[nessi] localStorage write failed for "${key}":`, err instanceof Error ? err.message : err);
  }
};

/** Remove a localStorage key. */
export const removeKey = (key: string) => {
  localStorage.removeItem(key);
};
