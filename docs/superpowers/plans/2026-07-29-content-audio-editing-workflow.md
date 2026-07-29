# 袋研官内容、音频与镜头创作工作流实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Windows 本地混剪工作台中交付“人设 → 文案 → 音频 → 镜头剪辑 → 创建任务”完整链路，并完成袋研官品牌视觉、MiniMax 声音克隆、BGM 文件夹/FLAC 和完整字幕样式。

**Architecture:** 继续采用 Electron Main + 白名单 Preload + Vue Renderer + FastAPI 服务。Electron/SQLite 管理创作草稿、业务实体和安全文件选择，Python 负责百炼文案、MiniMax 音频、媒体探测和 FFmpeg 合成；创建任务时把草稿转换为不可变快照。

**Tech Stack:** Electron 41、Vue 3、TypeScript、Element Plus、Zod、better-sqlite3、Python 3.11、FastAPI、Pydantic、MiniMax API、百炼 OpenAI-compatible API、FFmpeg/ffprobe、Vitest、Pytest、Playwright。

## Global Constraints

- 仅支持 Windows 11 x64，本地单用户。
- 侧边栏是唯一全局导航，不增加顶部步骤条。
- 固定创作顺序为“人设档案 → 文案生成 → 音频制作 → 镜头剪辑 → 创建任务”。
- Renderer 禁止直接访问 Node 和任意文件系统。
- API Key 只存 Windows Credential Manager，不进入 SQLite、草稿、任务快照和日志。
- 所有用户可见错误必须是中文，并提供下一步处理建议。
- 不绕过验证码、登录验证或平台风控。
- 默认输出 `1080×1920 / 30fps / H.264 + AAC`。
- 每个任务先写失败测试，再完成最小实现，模块测试通过后独立提交。

---

### Task 1: 创作草稿数据模型与迁移

**Files:**
- Create: `electron/repositories/creation-draft-repository.ts`
- Modify: `electron/database.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Test: `tests/electron/creation-draft-repository.test.ts`
- Test: `tests/electron/database.test.ts`
- Test: `tests/shared/contracts.test.ts`

**Interfaces:**
- Produces: `CreationDraftSchema`, `CreationDraft`, `CreationDraftRepository.get()`, `save(input)`, `clear()`, `duplicate()`.
- Draft stages: `"persona" | "copywriting" | "audio" | "editing" | "ready"`.
- Draft JSON contains versioned `copywriting`, `voice`, `audioSegments`, `shots`, `bgm`, `titleStyle`, `subtitleStyle`.

- [ ] **Step 1: Write failing database and repository tests**

```ts
it("persists and restores one versioned creation draft", () => {
  const repository = new CreationDraftRepository(database);
  repository.save({
    version: 1,
    stage: "copywriting",
    personaId: "persona-1",
    copywriting: { model: "deepseek-v3", text: "测试文案" }
  });
  expect(repository.get()?.copywriting.text).toBe("测试文案");
});
```

- [ ] **Step 2: Run tests and verify missing table/repository failure**

Run: `npx vitest run tests/electron/database.test.ts tests/electron/creation-draft-repository.test.ts tests/shared/contracts.test.ts`

Expected: FAIL because the draft table, schema and repository do not exist.

- [ ] **Step 3: Add migration and repository**

Add `creation_drafts(id, version, stage, payload_json, created_at, updated_at)` with singleton ID `active`. Parse every read/write through Zod and use a transaction for save/duplicate/clear.

- [ ] **Step 4: Expose typed IPC**

Add `draft:get`, `draft:save`, `draft:clear`, `draft:duplicate` handlers and `window.autocut` methods. Reject payloads that fail `CreationDraftSchema`.

- [ ] **Step 5: Run focused and full Electron tests**

Run: `npx vitest run tests/electron/creation-draft-repository.test.ts tests/electron/database.test.ts tests/shared/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add electron/database.ts electron/repositories/creation-draft-repository.ts electron/preload.ts src/shared/contracts.ts src/renderer/env.d.ts tests
git commit -m "feat: persist versioned creation drafts"
```

### Task 2: 品牌资源与单侧边栏视觉系统

**Files:**
- Create: `src/renderer/assets/bag-lab-avatar.png`
- Create: `src/renderer/assets/bag-lab-avatar.ico`
- Create: `scripts/build-brand-assets.mjs`
- Modify: `build/icon.png`
- Modify: `src/renderer/layouts/AppShell.vue`
- Modify: `src/renderer/styles/global.css`
- Modify: `src/shared/product-copy.ts`
- Modify: `package.json`
- Test: `tests/renderer/app-shell.test.ts`
- Test: `tests/electron/application-menu.test.ts`

**Interfaces:**
- Consumes: user-provided avatar source image.
- Produces: deterministic PNG/ICO assets and yellow/black/white CSS tokens.

- [ ] **Step 1: Inspect the supplied avatar and add failing brand tests**

Verify the source image visually before editing. Test exact sidebar order, Chinese labels, product name, avatar alt text and absence of a top workflow navigation.

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `npx vitest run tests/renderer/app-shell.test.ts tests/electron/application-menu.test.ts`

Expected: FAIL because copywriting/audio routes and new branding are absent.

- [ ] **Step 3: Build deterministic brand assets**

Create a script that center-crops the avatar with safe padding, outputs a rounded-square PNG and multi-size ICO, and copies the PNG to `build/icon.png`. Do not alter the character illustration.

- [ ] **Step 4: Implement global design tokens and sidebar**

Define `--brand-yellow`, `--brand-black`, `--surface`, `--surface-muted`, semantic success/warning/error tokens. Reorder navigation to 工作台、人设档案、素材中心、文案生成、音频制作、镜头剪辑、任务中心、发布账号、发布排期、系统设置.

- [ ] **Step 5: Run tests and a production build**

Run: `npx vitest run tests/renderer/app-shell.test.ts tests/electron/application-menu.test.ts`

Run: `npm run build`

Expected: PASS and packaged renderer resolves the new avatar.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/assets build/icon.png scripts/build-brand-assets.mjs src/renderer/layouts/AppShell.vue src/renderer/styles/global.css src/shared/product-copy.ts package.json tests
git commit -m "feat: apply Bag Lab creation workspace branding"
```

### Task 3: 文案模型设置与参考脚本库

**Files:**
- Create: `electron/repositories/reference-script-repository.ts`
- Create: `src/renderer/views/ReferenceScriptsView.vue`
- Modify: `electron/database.ts`
- Modify: `electron/repositories/settings-repository.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/views/SettingsView.vue`
- Test: `tests/electron/reference-script-repository.test.ts`
- Test: `tests/electron/settings-repository.test.ts`

**Interfaces:**
- Produces: `ReferenceScriptRepository.create/list/delete/search`.
- Produces: `CopyModelSettings { defaultModel, temperature, candidateModels }`.
- Search returns no more than five relevant scripts using normalized keyword/tag scoring.

- [ ] **Step 1: Write failing repository and settings tests**

```ts
expect(repository.search({ industry: "工厂", query: "获客", limit: 3 }))
  .toEqual(expect.arrayContaining([expect.objectContaining({ title: "工厂获客脚本" })]));
expect(settings.copywriting.defaultModel).toBe("deepseek-v3");
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run tests/electron/reference-script-repository.test.ts tests/electron/settings-repository.test.ts`

- [ ] **Step 3: Add schema, repositories and IPC**

Create `reference_scripts` with title, industry, tags JSON, content, structure JSON and timestamps. Extend settings without storing credentials.

- [ ] **Step 4: Add settings UI and script import/list UI**

Allow default model, candidate model names and temperature. Support pasted script creation, tags, search and deletion. Keep the feature local and deterministic.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/electron/reference-script-repository.test.ts tests/electron/settings-repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add electron src/renderer src/shared tests
git commit -m "feat: add configurable copy models and reference scripts"
```

### Task 4: 百炼选题、脚本与违禁词服务

**Files:**
- Create: `backend/app/copywriting/topic_service.py`
- Create: `backend/app/copywriting/compliance.py`
- Modify: `backend/app/copywriting/bailian.py`
- Modify: `backend/app/copywriting/service.py`
- Modify: `backend/app/main.py`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Test: `backend/tests/test_topics.py`
- Test: `backend/tests/test_compliance.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Produces: `POST /copywriting/topics`.
- Produces: `POST /copywriting/generate`.
- Produces: `POST /copywriting/compliance`.
- Topic response contains exactly five unique `{id, title, angle, hook}` values.
- Compliance response contains `{term, start, end, riskType, explanation, suggestion}` and never silently rewrites text.

- [ ] **Step 1: Write failing Pydantic and API tests**

```python
def test_topics_returns_five_unique_candidates():
    result = service.generate_topics(request)
    assert len(result.topics) == 5
    assert len({topic.title for topic in result.topics}) == 5

def test_local_compliance_marks_superlatives_without_rewriting():
    result = checker.check("这是全网最好的产品")
    assert result.original_text == "这是全网最好的产品"
    assert result.issues[0].term == "最"
```

- [ ] **Step 2: Run tests and verify endpoint/schema failures**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_compliance.py backend/tests/test_api.py -q`

- [ ] **Step 3: Implement structured Bailian requests**

Build prompts from Persona, selected model, reference script structures and requested length. Validate JSON, retry structural repair at most twice and reject scripts outside 200–1000 Chinese characters.

- [ ] **Step 4: Implement two-layer compliance**

Run local regex/dictionary rules first, then optionally request AI explanations and suggestions. Preserve source offsets and original text.

- [ ] **Step 5: Add authenticated Electron bridge**

Forward the stored Bailian key only in request headers; validate request and response with Zod.

- [ ] **Step 6: Run Python and bridge contract tests**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_compliance.py backend/tests/test_api.py -q`

Run: `npx vitest run tests/shared/contracts.test.ts`

- [ ] **Step 7: Commit**

```powershell
git add backend electron src/shared tests
git commit -m "feat: generate topics scripts and compliance advice"
```

### Task 5: 文案生成页面与草稿串联

**Files:**
- Create: `src/renderer/views/CopywritingView.vue`
- Create: `src/renderer/components/copywriting/TopicPicker.vue`
- Create: `src/renderer/components/copywriting/CompliancePanel.vue`
- Create: `src/renderer/composables/useCreationDraft.ts`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/layouts/AppShell.vue`
- Test: `tests/renderer/copywriting-view.test.ts`
- Test: `tests/renderer/creation-draft.test.ts`

**Interfaces:**
- Consumes: draft IPC, Persona IPC, topic/generate/compliance APIs, model settings.
- Produces: confirmed draft copywriting and navigation to `/audio`.

- [ ] **Step 1: Write failing component tests**

Test five selectable topics, “换一批”, custom text mode, 200–1000 counter, model override, compliance highlighting, confirm-replacement behavior and draft restoration.

- [ ] **Step 2: Run tests and verify component failure**

Run: `npx vitest run tests/renderer/copywriting-view.test.ts tests/renderer/creation-draft.test.ts`

- [ ] **Step 3: Implement draft composable**

Debounce saves, expose explicit flush before navigation, surface Chinese save errors and restore only valid versioned drafts.

- [ ] **Step 4: Implement page and child components**

Use a large white content card, black primary buttons, yellow active selection and accessible labels. Do not add a top stepper.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/renderer/copywriting-view.test.ts tests/renderer/creation-draft.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer tests/renderer
git commit -m "feat: add guided copywriting workspace"
```

### Task 6: MiniMax 声音克隆和能力接口

**Files:**
- Create: `backend/app/voice/cloning.py`
- Modify: `backend/app/voice/minimax.py`
- Modify: `backend/app/voice/service.py`
- Modify: `backend/app/main.py`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Test: `backend/tests/test_voice_cloning.py`
- Test: `backend/tests/test_voice_api.py`
- Test: `backend/tests/test_voice_service.py`

**Interfaces:**
- Produces: `POST /voices/clones`, `GET /voices/clones/{id}`, `POST /voices/sample/validate`.
- Produces: voice capability fields `emotions`, `speedRange`, `volumeRange`, `pitchRange`.
- Clone lifecycle: `validating | uploading | training | ready | failed`.

- [ ] **Step 1: Verify current official MiniMax API contract**

Use MiniMax primary documentation to confirm current upload, clone, status, voice list and TTS request schemas. Isolate endpoint-specific fields inside `MiniMaxVoiceClient`.

- [ ] **Step 2: Write failing sample validation and API mock tests**

Cover supported format, empty/corrupt input, duration boundary, rate limit, permission denial, polling, ready voice ID and Chinese error mapping.

- [ ] **Step 3: Run tests and verify failure**

Run: `python -m pytest backend/tests/test_voice_cloning.py backend/tests/test_voice_api.py backend/tests/test_voice_service.py -q`

- [ ] **Step 4: Implement clone adapter and persistence-safe responses**

Never store upload authorization headers. Return local clone metadata and provider IDs only. Use bounded exponential backoff for status polling.

- [ ] **Step 5: Extend TTS request parameters**

Add validated emotion, speed, volume, pitch and language boost fields to synthesis and cache keys. Reject unsupported capability combinations before network calls.

- [ ] **Step 6: Expose typed Electron bridge and run tests**

Run: `python -m pytest backend/tests/test_voice_cloning.py backend/tests/test_voice_api.py backend/tests/test_voice_service.py -q`

Run: `npx vitest run tests/shared/contracts.test.ts`

- [ ] **Step 7: Commit**

```powershell
git add backend electron src tests
git commit -m "feat: integrate MiniMax voice cloning"
```

### Task 7: 音频制作页面与逐段缓存

**Files:**
- Create: `src/renderer/views/AudioProductionView.vue`
- Create: `src/renderer/components/audio/VoiceLibrary.vue`
- Create: `src/renderer/components/audio/VoiceCloneDialog.vue`
- Create: `src/renderer/components/audio/AudioSegmentList.vue`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/layouts/AppShell.vue`
- Modify: `backend/app/tasks/pipeline.py`
- Test: `tests/renderer/audio-production-view.test.ts`
- Test: `backend/tests/test_generation_pipeline.py`

**Interfaces:**
- Consumes: confirmed copywriting draft and MiniMax voice APIs.
- Produces: ordered `DraftAudioSegment[]` with text hash, parameter hash, audio path, duration and status.

- [ ] **Step 1: Write failing UI and pipeline tests**

Cover voice list, sample upload, existing custom voice ID, emotion options, speed/volume/pitch, audition, per-segment generation, one-segment retry and cache invalidation.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/renderer/audio-production-view.test.ts`

Run: `python -m pytest backend/tests/test_generation_pipeline.py -q`

- [ ] **Step 3: Implement deterministic text segmentation**

Split on Chinese sentence punctuation with configurable target length, preserve order and source character ranges, and avoid empty segments.

- [ ] **Step 4: Implement audio UI**

Display clone state, voice audition and full-script segment progress. Disable “进入镜头剪辑” until every nonempty segment is ready.

- [ ] **Step 5: Pass full voice settings into generation pipeline**

Use saved segment audio when text and parameter hashes match; synthesize only stale or failed segments.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run tests/renderer/audio-production-view.test.ts`

Run: `python -m pytest backend/tests/test_generation_pipeline.py backend/tests/test_voice_service.py -q`

```powershell
git add src/renderer backend tests
git commit -m "feat: add segment-based audio production"
```

### Task 8: BGM 文件夹、FLAC 与字体探测

**Files:**
- Create: `backend/app/media/audio_library.py`
- Create: `backend/app/media/font_probe.py`
- Modify: `backend/app/main.py`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `backend/app/timeline/exporter.py`
- Test: `backend/tests/test_audio_library.py`
- Test: `backend/tests/test_font_probe.py`
- Test: `backend/tests/test_timeline_exporter.py`

**Interfaces:**
- Produces: `POST /media/audio-library/scan`, `POST /media/fonts/probe`.
- Supported BGM extensions: `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`.
- Deterministic selection: `select_track(tracks, mode, seed, cursor)`.

- [ ] **Step 1: Write failing media tests**

Test recursive/non-recursive folder scan, FLAC inclusion, corrupt isolation, fixed/random/sequential selection, seed reproducibility and TTF/OTF metadata.

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest backend/tests/test_audio_library.py backend/tests/test_font_probe.py backend/tests/test_timeline_exporter.py -q`

- [ ] **Step 3: Implement ffprobe-based audio library**

Return playable tracks and quarantined entries separately. Cache by path, size and mtime. Never silently omit an unreadable file.

- [ ] **Step 4: Implement font probe and safe IPC pickers**

Add separate file/folder dialogs for BGM and TTF/OTF selection. Renderer receives only user-selected paths and parsed metadata.

- [ ] **Step 5: Ensure FFmpeg accepts FLAC input**

Keep output audio AAC, loop input BGM, apply volume and fades, and test command construction with FLAC.

- [ ] **Step 6: Run tests and commit**

```powershell
python -m pytest backend/tests/test_audio_library.py backend/tests/test_font_probe.py backend/tests/test_timeline_exporter.py -q
git add backend electron src tests
git commit -m "feat: add folder music FLAC and font probing"
```

### Task 9: 字幕和标题样式引擎

**Files:**
- Create: `src/shared/media-style.ts`
- Create: `src/renderer/components/editing/SubtitleStyleEditor.vue`
- Create: `src/renderer/components/editing/TitleStyleEditor.vue`
- Create: `src/renderer/components/editing/PhoneCanvasPreview.vue`
- Modify: `backend/app/timeline/exporter.py`
- Modify: `backend/app/tasks/pipeline.py`
- Test: `tests/shared/media-style.test.ts`
- Test: `tests/renderer/subtitle-style-editor.test.ts`
- Test: `backend/tests/test_timeline_exporter.py`

**Interfaces:**
- Produces: `TextStyle` with font path/family, size, primary/outline/shadow colors, outline width, shadow X/Y, alignment and margins.
- Produces: ASS style generation for independent title and subtitle tracks.

- [ ] **Step 1: Write failing schema, component and ASS snapshot tests**

Test invalid colors, missing fonts, style presets, live preview mapping, ASS `Style:` fields, title display interval and escaped Chinese text.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/shared/media-style.test.ts tests/renderer/subtitle-style-editor.test.ts`

Run: `python -m pytest backend/tests/test_timeline_exporter.py -q`

- [ ] **Step 3: Implement shared style schema and editors**

Provide readable presets while retaining full manual controls. Store both font path and resolved family.

- [ ] **Step 4: Extend timeline model and ASS writer**

Generate separate ASS styles/events for title and dialogue. Validate referenced font before starting FFmpeg.

- [ ] **Step 5: Run tests and commit**

```powershell
npx vitest run tests/shared/media-style.test.ts tests/renderer/subtitle-style-editor.test.ts
python -m pytest backend/tests/test_timeline_exporter.py -q
git add src backend tests
git commit -m "feat: add title and subtitle styling"
```

### Task 10: 三栏镜头剪辑工作室

**Files:**
- Create: `src/renderer/components/editing/TemplateLibrary.vue`
- Create: `src/renderer/components/editing/ShotEditor.vue`
- Create: `src/renderer/components/editing/MediaSettingsPanel.vue`
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `electron/repositories/template-repository.ts`
- Modify: `electron/database.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Test: `tests/renderer/templates-view.test.ts`
- Test: `tests/electron/template-repository.test.ts`

**Interfaces:**
- Consumes: draft text/audio segments, asset categories, BGM library and text styles.
- Produces: validated ordered shots and reusable template defaults.

- [ ] **Step 1: Write failing repository and component tests**

Cover three-column structure, audio-derived shots, split/merge/add/delete/reorder, category selection, duration sync, template snapshot isolation, BGM settings and style panel.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/renderer/templates-view.test.ts tests/electron/template-repository.test.ts`

- [ ] **Step 3: Add template settings migration**

Persist default BGM, title style, subtitle style and media rules without changing existing task snapshots.

- [ ] **Step 4: Split the current large template view**

Keep each component focused: library manages templates, shot editor manages ordered shots, media panel manages BGM/title/subtitle. Adapt to one column below the desktop breakpoint.

- [ ] **Step 5: Validate before task creation**

Block creation for missing audio, missing category, empty dialogue, invalid fixed duration, missing font, empty music folder or insufficient assets. Show exact Chinese issue and affected shot.

- [ ] **Step 6: Run tests and commit**

```powershell
npx vitest run tests/renderer/templates-view.test.ts tests/electron/template-repository.test.ts
git add src electron tests
git commit -m "feat: build three-column shot editing studio"
```

### Task 11: 草稿转任务快照与完整合成

**Files:**
- Create: `electron/services/task-snapshot-service.ts`
- Modify: `electron/repositories/task-repository.ts`
- Modify: `electron/main.ts`
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/app/tasks/pipeline.py`
- Modify: `backend/app/timeline/asset_selector.py`
- Modify: `backend/app/timeline/exporter.py`
- Test: `tests/electron/task-snapshot-service.test.ts`
- Test: `tests/electron/task-repository.test.ts`
- Test: `backend/tests/test_generation_pipeline.py`
- Test: `backend/tests/test_timeline_integration.py`

**Interfaces:**
- Produces: `createTaskFromDraft(draft, count): GenerationTask[]`.
- Snapshot includes Persona facts, model metadata, final text, segment audio, voice parameters, shots, BGM selection rule/result and text styles.
- Snapshot excludes API keys, authorization and cookies.

- [ ] **Step 1: Write failing snapshot and integration tests**

Assert immutability, secret absence, deterministic BGM/asset selection, reuse of ready audio, styled subtitles and complete MP4 metadata.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/electron/task-snapshot-service.test.ts tests/electron/task-repository.test.ts`

Run: `python -m pytest backend/tests/test_generation_pipeline.py backend/tests/test_timeline_integration.py -q`

- [ ] **Step 3: Implement snapshot service**

Validate the ready draft, resolve the selected BGM deterministically per task seed and write task + shots in one transaction.

- [ ] **Step 4: Extend pipeline**

Skip rewrite and synthesis stages when approved text and ready segment audio are present. Preserve existing retry/cancel semantics and exact-stage error messages.

- [ ] **Step 5: Run focused and full backend tests**

Run: `npx vitest run tests/electron/task-snapshot-service.test.ts tests/electron/task-repository.test.ts`

Run: `python -m pytest backend/tests -q`

- [ ] **Step 6: Commit**

```powershell
git add electron backend tests
git commit -m "feat: compose tasks from creation drafts"
```

### Task 12: 中文错误、恢复和诊断

**Files:**
- Modify: `src/renderer/lib/user-error.ts`
- Create: `backend/app/errors.py`
- Modify: `backend/app/main.py`
- Modify: `electron/logger.ts`
- Modify: `electron/diagnostics.ts`
- Modify: relevant creation views
- Test: `tests/renderer/user-error.test.ts`
- Test: `backend/tests/test_api.py`
- Test: `tests/electron/diagnostics.test.ts`

**Interfaces:**
- Produces: stable error codes for copywriting, clone, synthesis, media, font, storage and encoding failures.
- Produces: Chinese `{title, detail, action}` UI messages.

- [ ] **Step 1: Write failing error mapping and redaction tests**

Cover timeout, 401/403, 429, invalid voice sample, unsupported emotion, missing font, corrupt FLAC, disk full and backend restart. Assert no key, token, cookie or upload URL leaks.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/renderer/user-error.test.ts tests/electron/diagnostics.test.ts`

Run: `python -m pytest backend/tests/test_api.py -q`

- [ ] **Step 3: Implement stable backend and renderer mappings**

Keep provider messages only in redacted logs. UI messages must name the failed stage and an actionable recovery operation.

- [ ] **Step 4: Add draft/task recovery affordances**

Expose retry-current-segment, retry-clone, rescan-music, replace-font and reopen-output actions where applicable.

- [ ] **Step 5: Run tests and commit**

```powershell
npx vitest run tests/renderer/user-error.test.ts tests/electron/diagnostics.test.ts
python -m pytest backend/tests/test_api.py -q
git add src backend electron tests
git commit -m "feat: localize creation errors and recovery"
```

### Task 13: 完整流程 E2E 与视觉验收

**Files:**
- Create: `tests/e2e/creation-workflow.spec.ts`
- Create: `tests/fixtures/mock-ai-server.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Test: all Vitest/Pytest suites

**Interfaces:**
- Validates: persona → copywriting → audio → editing → task flow without real credentials.
- Mock server simulates Bailian and MiniMax success, invalid JSON, limit, timeout and clone polling.

- [ ] **Step 1: Write failing Electron E2E**

Automate selecting a Persona, generating five topics, editing copy, confirming a compliance suggestion, cloning a mock voice, generating segments, mapping asset categories, selecting a FLAC folder, styling subtitles and creating a task.

- [ ] **Step 2: Run E2E and verify failure**

Run: `npx playwright test tests/e2e/creation-workflow.spec.ts`

- [ ] **Step 3: Add deterministic mock services and fixtures**

Use local sample media and fonts. Never require external APIs in CI.

- [ ] **Step 4: Fix integration gaps without weakening assertions**

Preserve page reload and application restart coverage to prove draft restoration.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run test:python`

Run: `npx playwright test tests/e2e/creation-workflow.spec.ts`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add tests package.json vite.config.ts
git commit -m "test: cover complete creation workflow"
```

### Task 14: Windows 安装包与真实服务交付

**Files:**
- Modify: `package.json`
- Modify: `scripts/build-installer.mjs`
- Modify: `scripts/prepare-runtime.mjs`
- Modify: `docs/用户操作手册.md`
- Modify: `docs/故障排查手册.md`
- Modify: `docs/外部服务验收清单.md`

**Interfaces:**
- Produces: versioned x64 NSIS installer and SHA-256 checksum.
- Produces: one final user-action checklist for Bailian, MiniMax clone sample and platform login.

- [ ] **Step 1: Update packaging assertions**

Require the product name `袋研官矩阵混剪工作台`, avatar icon, Python service, FFmpeg/ffprobe and Playwright Chromium in the unpacked artifact.

- [ ] **Step 2: Run final automated verification**

Run: `npm run check`

Expected: typecheck, Vitest, Pytest and production build all pass.

- [ ] **Step 3: Build installer**

Run: `npm run dist:win`

Expected: one x64 installer in `release`, with no dependency on preinstalled Node, Python, FFmpeg or Chrome.

- [ ] **Step 4: Install and perform packaged smoke test**

Verify first launch, preload bridge, backend health, folder/file dialogs, Chinese paths, draft persistence, avatar in window/taskbar/shortcut and mock end-to-end creation.

- [ ] **Step 5: Perform real-service acceptance where credentials permit**

Use user-entered credentials through the UI. Generate one DeepSeek-backed script, clone one prepared MiniMax voice, synthesize segments and create one real output video. Do not print or persist credentials.

- [ ] **Step 6: Update manuals and checksum**

Document the final flow, supported audio/font formats, clone sample requirements, Chinese error recovery and any actions that must be performed by the user.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts docs
git commit -m "release: package upgraded Bag Lab workstation"
```

## Final Acceptance Gate

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:python` passes.
- [ ] Electron creation-flow E2E passes.
- [ ] Production build and x64 installer succeed.
- [ ] Packaged app launches visibly and the backend reports healthy.
- [ ] No plaintext API Key, Cookie or Authorization appears in SQLite, logs, drafts or task snapshots.
- [ ] BGM folder selection includes FLAC and isolates corrupt files.
- [ ] Imported font and subtitle styling appear in the generated ASS/video.
- [ ] MiniMax voice cloning and per-segment retry work with the user’s enabled account.
- [ ] The final installer, checksum, documentation and consolidated user-action list are delivered.
