import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const preloadPath = resolve("dist-electron/preload/preload.mjs");
const preload = readFileSync(preloadPath, "utf8");

if (!preload.includes('exposeInMainWorld("autocut"')) {
  throw new Error("预加载产物未导出 autocut 桥接");
}
if (!preload.includes("selectAndScanAssets")) {
  throw new Error("预加载产物缺少素材目录扫描方法");
}
if (/from\s+["']zod["']/.test(preload)) {
  throw new Error("预加载产物仍外部依赖 zod，Electron 沙箱中无法运行");
}

console.log("预加载桥接审计通过");
