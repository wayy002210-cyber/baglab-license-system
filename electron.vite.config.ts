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
      lib: { entry: resolve("electron/preload.ts") }
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
