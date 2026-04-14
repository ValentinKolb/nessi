export const localStorageJson = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[nessi] localStorage write failed for "${key}":`, err instanceof Error ? err.message : err);
    }
  },

  readString(key: string, fallback = "") {
    return localStorage.getItem(key) ?? fallback;
  },

  writeString(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[nessi] localStorage write failed for "${key}":`, err instanceof Error ? err.message : err);
    }
  },

  remove(key: string) {
    localStorage.removeItem(key);
  },
} as const;
