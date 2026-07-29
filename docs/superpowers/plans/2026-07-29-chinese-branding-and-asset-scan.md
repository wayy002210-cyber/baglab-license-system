# 袋研官中文化、品牌替换与素材扫描修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可安装运行、素材目录可扫描、全中文且采用袋研官品牌的 Windows 桌面应用。

**Architecture:** 保持 Electron 安全隔离，修复预加载依赖打包边界；用集中式产品文案和错误本地化函数约束界面输出；用同一源 Logo 生成界面与 Windows 安装资源。

**Tech Stack:** Electron 41、electron-vite、Vue 3、TypeScript、Vitest、electron-builder、Windows ICO。

## Global Constraints

- 产品名固定为“袋研官矩阵混剪工作台”。
- Electron 必须保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
- 不允许向用户原样展示 JavaScript、IPC 或后端英文异常。
- Logo 必须来自用户提供的“袋研官 BAG LAB”原图。

---

### Task 1: 修复安装版预加载桥接

**Files:**
- Modify: `electron.vite.config.ts`
- Create: `scripts/verify-preload-bundle.mjs`
- Modify: `scripts/build-installer.mjs`
- Test: `tests/electron/preload-bundle.test.ts`

**Interfaces:**
- Produces: 安装环境可用的 `window.autocut.selectAndScanAssets(): Promise<AssetCategory | null>`。

- [ ] 编写失败测试，断言构建后的预加载文件不包含 `from "zod"`，且包含桥接方法名。
- [ ] 运行定向测试并确认因外部 `zod` 导入而失败。
- [ ] 配置 preload Rollup 将 `zod` 打入单文件，并增加构建审计脚本。
- [ ] 运行定向测试和 Electron 构建，确认桥接产物通过审计。
- [ ] 提交预加载修复。

### Task 2: 中文菜单、中文品牌与中文错误

**Files:**
- Create: `src/shared/product-copy.ts`
- Create: `src/renderer/lib/user-error.ts`
- Create: `electron/application-menu.ts`
- Modify: `electron/main.ts`
- Modify: `src/renderer/layouts/AppShell.vue`
- Modify: `src/renderer/views/AssetsView.vue`
- Modify: `src/renderer/views/DashboardView.vue`
- Modify: `src/renderer/index.html`
- Test: `tests/renderer/app-shell.test.ts`
- Test: `tests/renderer/user-error.test.ts`
- Test: `tests/electron/application-menu.test.ts`

**Interfaces:**
- Produces: `PRODUCT_NAME`、`PRODUCT_TAGLINE`、`toUserMessage(error, fallback)` 和 `createChineseMenuTemplate()`。

- [ ] 编写品牌文案、中文菜单和错误翻译失败测试。
- [ ] 运行定向测试并确认因旧英文品牌、默认英文菜单和原样异常而失败。
- [ ] 实现品牌常量、中文菜单及错误翻译器，并接入素材中心。
- [ ] 巡检所有用户可见英文文案，替换为中文或保留带中文解释的技术专名。
- [ ] 运行定向测试与完整前端测试。
- [ ] 提交中文化修改。

### Task 3: 替换 Logo 与 Windows 产品元数据

**Files:**
- Create: `build/icon.ico`
- Create: `src/renderer/assets/bag-lab-logo.jpg`
- Modify: `package.json`
- Modify: `src/renderer/layouts/AppShell.vue`
- Modify: `scripts/verify-installer.mjs`
- Test: `tests/renderer/app-shell.test.ts`

**Interfaces:**
- Consumes: 用户提供的 Logo 原图。
- Produces: 界面 Logo、Windows EXE/安装器/快捷方式图标和中文产品名称。

- [ ] 编写失败测试，断言侧栏渲染 Logo 且产品名为“袋研官矩阵混剪工作台”。
- [ ] 运行测试确认旧字母图标与旧产品名导致失败。
- [ ] 生成界面图片与多尺寸 ICO，配置 electron-builder 的 `icon`、`productName`、快捷方式名称和安装包文件名。
- [ ] 运行测试、类型检查和构建。
- [ ] 提交品牌资源修改。

### Task 4: 安装包与真实应用验收

**Files:**
- Modify: `scripts/verify-unpacked-app.mjs`
- Modify: `scripts/verify-installer.mjs`
- Modify: `docs/用户操作手册.md`

**Interfaces:**
- Produces: 可安装的 `袋研官矩阵混剪工作台-0.1.0-x64.exe`。

- [ ] 增加未打包与安装版桥接、窗口标题和可见窗口验证。
- [ ] 运行 TypeScript、Vitest、Pytest、构建和原生模块验证。
- [ ] 安装到测试目录，验证启动、中文菜单、Logo、素材目录选择和取消流程。
- [ ] 覆盖当前安装，验证桌面快捷方式名称与图标。
- [ ] 记录安装包大小、SHA-256 与仍需用户完成的外部账号验收。

