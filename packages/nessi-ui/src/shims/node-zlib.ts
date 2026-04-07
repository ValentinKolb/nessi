export const constants = {
  Z_BEST_COMPRESSION: 9,
  Z_BEST_SPEED: 1,
  Z_DEFAULT_COMPRESSION: -1,
} as const;

export function gunzipSync(): never {
  throw new Error("gzip decompression is not available in the browser build.");
}

export function gzipSync(): never {
  throw new Error("gzip compression is not available in the browser build.");
}
