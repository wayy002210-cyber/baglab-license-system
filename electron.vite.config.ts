import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron/main",
      lib: { entry: resolve("electron/main.ts") }
    }
  },
  preload: {
    build: {
      outDir: "dist-electron/preload",
      externalizeDeps: {
        exclude: ["zod"]
      },
      lib: { entry: resolve("electron/preload.ts") },
      rollupOptions: {
        // Sandboxed preload scripts can import Electron, but cannot resolve
        // arbitrary Node packages or execute ESM imports at runtime. Bundle
        // every dependency and emit CommonJS, leaving only Electron's
        // sandbox-supported require call external.
        external: ["electron"],
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs"
        }
      }
    }
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [vue()],
    build: {
      outDir: resolve("dist"),
      rollupOptions: { input: resolve("src/renderer/index.html") }
    }
  }
});
