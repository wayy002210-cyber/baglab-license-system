# Production Workflow Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 0.2.0 的人设、文案、音频、镜头和发布链路升级为有完整状态反馈、真实可操作且视觉一致的 Windows 成品。

**Architecture:** 把远程耗时操作统一到可测试的异步状态控制器；把音频、镜头和字体功能拆成独立服务与组件；发布账号创建后由 Electron 主进程直接启动独立浏览器登录。Vue 页面只编排状态，平台密钥、文件系统和浏览器仍由 Main/Python 边界管理。

**Tech Stack:** Electron 41、Vue 3、TypeScript、Element Plus、Pinia、Zod、better-sqlite3、FastAPI、Pydantic、MiniMax、百炼 OpenAI-compatible API、Playwright、Vitest、Pytest。

## Global Constraints

- 仅支持 Windows 11 x64。
- 流程固定为人设 → 文案 → 音频 → 镜头剪辑 → 创建任务。
- 不增加顶部流程条。
- 除模型标识外，声音、情感、状态和错误全部显示中文。
- API Key 不进入 SQLite、草稿、日志或 LocalStorage。
- 自动发布不绕过验证码、扫码或风控。
- 每个生产改动必须先有失败测试。

---

### Task 1: Unified asynchronous feedback and copywriting diagnosis

**Files:**
- Create: `src/renderer/lib/operation-state.ts`
- Create: `src/renderer/lib/__tests__/operation-state.test.ts`
- Modify: `src/renderer/views/CopywritingView.vue`
- Modify: `src/renderer/lib/user-error.ts`
- Test: `src/renderer/views/__tests__/CopywritingView.test.ts`

**Interfaces:**
- Produces: `useOperationState()` with `phase`, `progress`, `message`, `error`, `run()`, and `retry()`.
- Consumes: existing `window.autocut.generateTopics`, `generateCopywriting`, and `checkCopywritingCompliance`.

- [ ] Write failing tests proving missing credentials, timeout and unavailable model become visible Chinese recovery messages and that a running request exposes stage progress.
- [ ] Run `npm test -- operation-state CopywritingView` and verify the expected failures.
- [ ] Implement `useOperationState()` and map credential, HTTP 401/404/429 and timeout failures to actionable messages.
- [ ] Refactor all three copywriting operations to use the controller, add inline status/progress/error cards and retry actions.
- [ ] Run the focused tests and commit.

### Task 2: MiniMax display localization and voice-clone workflow

**Files:**
- Create: `src/renderer/audio/voice-labels.ts`
- Create: `src/renderer/audio/__tests__/voice-labels.test.ts`
- Modify: `src/renderer/views/AudioProductionView.vue`
- Modify: `src/renderer/components/audio/VoiceLibrary.vue`
- Modify: `src/renderer/components/audio/VoiceCloneDialog.vue`
- Modify: `src/renderer/components/audio/AudioSegmentList.vue`
- Test: `src/renderer/views/__tests__/AudioProductionView.test.ts`

**Interfaces:**
- Produces: `emotionOptions`, `voiceDisplayName(voice)`, `voiceKindLabel(kind)`.
- Consumes: MiniMax English enum values without changing API payloads.

- [ ] Write failing tests for Chinese emotion labels, known MiniMax voice labels, visible upload entry, clone stages and segment generation progress.
- [ ] Run focused tests and verify failure.
- [ ] Implement translation maps while preserving model IDs and API enum values.
- [ ] Rebuild the audio page layout around a prominent “上传声音样本并克隆” flow and a stage progress panel.
- [ ] Add per-segment errors, retry actions and overall completion progress.
- [ ] Run focused tests and commit.

### Task 3: System font catalog

**Files:**
- Create: `electron/services/system-font-service.ts`
- Create: `electron/services/__tests__/system-font-service.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Create: `src/renderer/components/editing/FontPicker.vue`
- Test: `src/renderer/components/editing/__tests__/FontPicker.test.ts`

**Interfaces:**
- Produces: `listSystemFonts(): SystemFont[]`, IPC `fonts:listSystem`.
- `SystemFont = { id: string; displayName: string; family: string; path: string; extension: "ttf"|"otf"|"ttc" }`.

- [ ] Write failing service tests using temporary Windows Fonts-style directories, including duplicate names and inaccessible files.
- [ ] Run tests and verify failure.
- [ ] Implement deterministic system and user font scanning with extension filtering and fallback.
- [ ] Expose typed IPC and preload bridge.
- [ ] Write and implement searchable font picker with a live sample rendered in the selected family.
- [ ] Run focused tests and commit.

### Task 4: Shot derivation and editable template domain

**Files:**
- Create: `src/renderer/editing/shot-builder.ts`
- Create: `src/renderer/editing/__tests__/shot-builder.test.ts`
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `src/renderer/components/editing/TemplateLibrary.vue`
- Modify: `src/renderer/components/editing/ShotEditor.vue`
- Test: `src/renderer/views/__tests__/TemplatesView.test.ts`

**Interfaces:**
- Produces: `buildShotsFromDraft(draft, categories)`, `appendShot(shots)`, `normalizeShotIndexes(shots)`.
- Consumes: draft copywriting, audio segments, templates and asset categories.

- [ ] Write failing tests for empty audio fallback, old-draft recovery, add/remove/reorder and template apply without destroying approved copy.
- [ ] Run tests and verify failure.
- [ ] Implement deterministic shot derivation from audio first and copywriting paragraphs second.
- [ ] Add explicit rebuild, add shot, new template, rename, duplicate, apply and save actions.
- [ ] Add visible empty/recovery states rather than an empty center panel.
- [ ] Run focused tests and commit.

### Task 5: Editing studio and phone preview redesign

**Files:**
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `src/renderer/components/editing/MediaSettingsPanel.vue`
- Modify: `src/renderer/components/editing/PhoneCanvasPreview.vue`
- Create: `src/renderer/components/editing/StyleEditor.vue`
- Test: `src/renderer/components/editing/__tests__/PhoneCanvasPreview.test.ts`
- Test: `src/renderer/components/editing/__tests__/StyleEditor.test.ts`

**Interfaces:**
- Consumes: Task 3 `FontPicker` and existing `MediaTextStyle`.
- Produces: responsive 260px / minmax(560px,1fr) / 420px layout.

- [ ] Write failing component tests for minimum preview size, independent title/subtitle style, non-overlapping controls and selected font sample.
- [ ] Run tests and verify failure.
- [ ] Rebuild the three-column layout and move media/style controls into coherent sections.
- [ ] Increase preview to at least 252×448, reduce default outline/shadow and align title/subtitle safely.
- [ ] Replace separate file buttons and numeric controls that overlap with structured form rows.
- [ ] Run focused tests and commit.

### Task 6: Real account connection on creation

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/views/PublishAccountsView.vue`
- Modify: `backend/app/publisher/service.py`
- Test: `electron/__tests__/publish-account-login.test.ts`
- Test: `backend/tests/test_publish_api.py`
- Test: `src/renderer/views/__tests__/PublishAccountsView.test.ts`

**Interfaces:**
- Produces: `createAndConnectPublishAccount(input)` and state values `opening`, `waiting_login`, `connected`, `needs_user`, `failed`.
- Consumes: existing per-account persistent Chromium directories.

- [ ] Write failing tests proving account creation starts the platform login context and UI reports each state.
- [ ] Run focused TypeScript and Pytest tests and verify failure.
- [ ] Implement create-and-connect IPC and bounded login status polling.
- [ ] Replace the note-only dialog with platform/name confirmation followed by the login status panel.
- [ ] Preserve manual user takeover for QR code, CAPTCHA and risk controls.
- [ ] Run focused tests and commit.

### Task 7: Reference-script preview and editing

**Files:**
- Modify: `src/renderer/components/copywriting/ReferenceScriptsPanel.vue`
- Modify: `src/renderer/views/SettingsView.vue`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `electron/repositories/reference-script-repository.ts`
- Test: `src/renderer/components/copywriting/__tests__/ReferenceScriptsPanel.test.ts`
- Test: `electron/repositories/__tests__/reference-script-repository.test.ts`

**Interfaces:**
- Produces: `updateReferenceScript(id, input)` IPC and expand/edit UI.

- [ ] Write failing tests for expand, content preview, edit/save and delete.
- [ ] Run focused tests and verify failure.
- [ ] Add repository and bridge update operation.
- [ ] Implement accordion-style preview with bounded content scrolling and inline edit dialog.
- [ ] Run focused tests and commit.

### Task 8: Global UI tokens and sticky navigation

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/layouts/AppShell.vue`
- Modify: `src/renderer/components/PageIntro.vue`
- Modify: affected view styles
- Test: `src/renderer/layouts/__tests__/AppShell.test.ts`
- Test: `src/renderer/__tests__/design-tokens.test.ts`

**Interfaces:**
- Produces: global spacing, typography, radius and control-height CSS variables.

- [ ] Write failing tests asserting sticky sidebar classes and required design tokens.
- [ ] Run tests and verify failure.
- [ ] Define the design tokens and normalize Element Plus buttons, inputs, cards and page spacing.
- [ ] Make the sidebar viewport-sticky with an independently scrollable nav.
- [ ] Apply responsive rules without shrinking the editing preview below its minimum.
- [ ] Run focused tests and commit.

### Task 9: Full regression, real desktop acceptance and Windows release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/用户操作手册.md`
- Create: `docs/0.3.0-验收记录.md`

**Interfaces:**
- Produces: `release/袋研官矩阵混剪工作台-0.3.0-x64.exe`.

- [ ] Run `npm run typecheck`, all Vitest tests and all Pytest tests.
- [ ] Launch the Electron development build and validate every changed page in the real Windows window.
- [ ] Validate the failure path for missing credentials and the success path with mock/local services without exposing secrets.
- [ ] Rebuild runtime resources and package Windows 0.3.0.
- [ ] Launch `win-unpacked` and verify window startup, sticky sidebar, audio, editing and account-login interfaces.
- [ ] Record artifact size, SHA256 and remaining user-only external-service acceptance steps.
- [ ] Commit release metadata and documentation.
