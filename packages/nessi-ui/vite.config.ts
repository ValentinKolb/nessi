import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const shim = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      "node:zlib": shim("./src/shims/node-zlib.ts"),
      "node:async_hooks": shim("./src/shims/node-async-hooks.ts"),
      "node:crypto": shim("./src/shims/node-crypto.ts"),
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
