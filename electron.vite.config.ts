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
        // arbitrary Node packages at runtime. Bundle Zod and every other
        // preload dependency into the generated module.
        external: ["electron"]
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
