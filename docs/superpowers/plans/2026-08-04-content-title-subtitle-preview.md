# Content Title, Subtitle Layout, and Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single 5–8-character title lineage from topic generation through copywriting, tasks, and MP4 filenames while fixing subtitle overflow, font discovery, task preview playback, and output-folder pollution.

**Architecture:** Extend the structured topic contract and persist the short title as canonical project data, then freeze it into immutable task snapshots. Move subtitle layout into a deterministic shared rule set with Python as the export authority, expose only validated media paths through Electron, and keep render artifacts under the work directory.

**Tech Stack:** Electron 41, Vue 3, TypeScript 5.9, Element Plus, better-sqlite3, Python 3.11, FastAPI/Pydantic, FFmpeg/libass, Vitest, Vue Test Utils, Pytest.

## Global Constraints

- Windows 11 x64 local-only application.
- Archived copywriting edits create a new version; historical tasks and finished videos remain immutable.
- Canonical short titles contain 5–8 Chinese characters and drive topic, copywriting, task, publishing, and MP4 naming.
- Renderer never receives unrestricted filesystem access.
- Output directory contains final MP4 files only; ASS, partial video, voice cache, and logs live under the work directory.
- Subtitle animation is excluded from this implementation; first stabilize wrapping, preview, and batch rendering.
- Preserve all existing tasks, videos, and archives during migration.
- Do not stage or delete existing `tmp-isolate-*`, `tmp-real-benchmark-*`, or `tmp-threads2.*` benchmark artifacts.

---

## File Structure

- `src/shared/contracts.ts`: public topic/project/style validation contracts.
- `src/shared/short-title.ts`: title normalization and Windows-safe filename rules.
- `backend/app/copywriting/topic_service.py`: AI prompts, structured topic validation, spoken-copy cleanup.
- `backend/app/copywriting/spoken_copy.py`: deterministic removal of stage directions.
- `electron/repositories/copywriting-project-repository.ts`: project persistence and archive version cloning.
- `src/renderer/views/CopywritingView.vue`: progress, select-all, topic cards, archive editing.
- `src/renderer/views/AudioProductionView.vue`: voice settings without duplicate volume.
- `src/shared/subtitle-layout.ts`: renderer-side subtitle preview layout using shared constants.
- `backend/app/timeline/subtitle_layout.py`: authoritative semantic line wrapping and event splitting.
- `backend/app/timeline/exporter.py`: work-directory ASS rendering and cleanup.
- `electron/services/system-font-service.ts`: Windows directories, registry, and font collection discovery.
- `src/renderer/components/editing/PhoneCanvasPreview.vue`: preview background and wrapped caption display.
- `electron/main.ts`: validated media protocol, output-folder action, task output allocation.
- `src/renderer/views/TasksView.vue`: fixed right preview and compact left task table.
- `electron/services/task-snapshot-service.ts`: freeze canonical title and final filename.

---

### Task 1: Canonical Topic and Short-Title Contracts

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/short-title.ts`
- Modify: `src/renderer/copywriting/generate-copywriting-batch.ts`
- Test: `tests/shared/short-title.test.ts`
- Test: `tests/renderer/generate-copywriting-batch.test.ts`

**Interfaces:**
- Produces: `normalizeShortTitle(value: string): string`
- Produces: `toSafeOutputStem(value: string): string`
- Produces topic fields `shortTitle`, `description`, and `hook`.

- [ ] **Step 1: Write failing short-title contract tests**

```ts
expect(normalizeShortTitle("  总嫌贵？我教你！ ")).toBe("总嫌贵我教你");
expect(() => topicResultSchema.parse({ topics: [{ id: "a", shortTitle: "太短", description: "方向", hook: "钩子" }] })).toThrow();
expect(toSafeOutputStem('客户说：“贵”/怎么办?')).toBe("客户说贵怎么办");
```

- [ ] **Step 2: Run tests and confirm the old title shape fails**

Run: `npx vitest run tests/shared/short-title.test.ts tests/renderer/generate-copywriting-batch.test.ts`

Expected: FAIL because the contract still uses `title/angle` and limits `mainTitle` to 5–6.

- [ ] **Step 3: Implement the canonical contract**

```ts
const topicCandidateSchema = z.object({
  id: z.string().min(1),
  shortTitle: z.string().regex(/^[\u3400-\u9fff]{5,8}$/),
  description: z.string().min(10).max(160),
  hook: z.string().min(1).max(120)
});
```

Update `mainTitle` validation to 5–8 characters. Strip Windows-invalid characters, trailing dots/spaces, and reserved device names in `toSafeOutputStem`.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/shared/short-title.test.ts tests/renderer/generate-copywriting-batch.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/contracts.ts src/shared/short-title.ts src/renderer/copywriting/generate-copywriting-batch.ts tests/shared/short-title.test.ts tests/renderer/generate-copywriting-batch.test.ts
git commit -m "feat: define canonical short topic titles"
```

### Task 2: Structured Topic Generation and Spoken-Copy Cleanup

**Files:**
- Create: `backend/app/copywriting/spoken_copy.py`
- Modify: `backend/app/copywriting/topic_service.py`
- Test: `backend/tests/test_topics.py`
- Test: `backend/tests/test_copywriting.py`

**Interfaces:**
- Consumes: topic JSON fields from Task 1.
- Produces: `clean_spoken_copy(text: str) -> str`.

- [ ] **Step 1: Add failing backend tests**

```python
def test_clean_spoken_copy_removes_stage_directions():
    assert clean_spoken_copy("（叉腰叹气）同行价格越来越低。【停顿】但质量不能降。") == "同行价格越来越低。但质量不能降。"

def test_topic_prompt_returns_short_title_and_description(fake_chat):
    fake_chat.response = '{"topics":[{"id":"a","shortTitle":"同行低价真相","description":"解释低价竞争背后的质量代价","hook":"便宜一定省钱吗"}]}'
    assert service.generate_topics(...).topics[0].short_title == "同行低价真相"
```

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_copywriting.py -q`

Expected: FAIL because `TopicCandidate` lacks the new fields and cleanup does not exist.

- [ ] **Step 3: Implement prompts, validation, and cleanup**

Use a Chinese UTF-8 prompt requiring five unique items and only JSON. Pass `shortTitle + description + hook` into detailed copy generation. Apply `clean_spoken_copy` before length and banned-word validation.

```python
STAGE_PATTERNS = (
    re.compile(r"[（(【\[].{0,20}?(?:叹气|叉腰|停顿|镜头|画面|旁白|敲黑板).{0,20}?[）)】\]]"),
    re.compile(r"^(?:镜头|画面|旁白|动作)\s*[:：].*$", re.MULTILINE),
)
```

- [ ] **Step 4: Run backend tests**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_copywriting.py -q`

Expected: PASS, including malformed-provider repair tests.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/copywriting/topic_service.py backend/app/copywriting/spoken_copy.py backend/tests/test_topics.py backend/tests/test_copywriting.py
git commit -m "feat: generate structured topics and clean spoken copy"
```

### Task 3: Topic Progress, Select-All, and Archive Version Editing

**Files:**
- Modify: `src/renderer/views/CopywritingView.vue`
- Modify: `electron/repositories/copywriting-project-repository.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Test: `tests/renderer/copywriting-view.test.ts`
- Test: `tests/electron/copywriting-project-repository.test.ts`

**Interfaces:**
- Produces: `cloneArchivedCopywritingProject(id: string): Promise<CopywritingProject>`.
- Consumes: new topic fields from Task 1.

- [ ] **Step 1: Write failing UI and repository tests**

```ts
expect(wrapper.get('[data-action="select-all-topics"]').text()).toContain("全选");
await wrapper.get('[data-action="generate-topics"]').trigger("click");
expect(wrapper.get('[data-testid="topic-progress"]').exists()).toBe(true);
expect(mockGenerateTopics).toHaveBeenCalledTimes(1);

const clone = repository.cloneArchived(original.id);
expect(clone.id).not.toBe(original.id);
expect(clone.status).toBe("library");
expect(repository.get(original.id)?.status).toBe("archived");
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/renderer/copywriting-view.test.ts tests/electron/copywriting-project-repository.test.ts`

Expected: FAIL because archive cloning and select-all do not exist.

- [ ] **Step 3: Implement the interaction and immutable clone flow**

Add an elapsed timer updated every second while `loadingTopics` is true, an indeterminate progress bar, disabled duplicate buttons, and select-all toggling. Load `review`, `failed`, and `archived` projects on the page. Archive edit calls the clone IPC and edits the clone only.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/renderer/copywriting-view.test.ts tests/electron/copywriting-project-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/views/CopywritingView.vue electron/repositories/copywriting-project-repository.ts electron/main.ts electron/preload.ts src/renderer/env.d.ts tests/renderer/copywriting-view.test.ts tests/electron/copywriting-project-repository.test.ts
git commit -m "feat: add topic progress and archive versioning"
```

### Task 4: Remove Duplicate Voice Volume

**Files:**
- Modify: `src/renderer/views/AudioProductionView.vue`
- Test: `tests/renderer/audio-production-view.test.ts`

**Interfaces:**
- Preserves persisted `volume` for backward compatibility.
- Does not expose volume control on the audio settings page.

- [ ] **Step 1: Add a failing component test**

```ts
expect(wrapper.text()).not.toContain("人声音量");
expect(wrapper.text()).toContain("语速");
expect(wrapper.text()).toContain("音调");
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/renderer/audio-production-view.test.ts`

Expected: FAIL because the slider is currently rendered.

- [ ] **Step 3: Remove only the duplicate control**

Keep the stored value and preview request compatibility; remove the label/slider from the template and rebalance the grid.

- [ ] **Step 4: Run test and commit**

Run: `npx vitest run tests/renderer/audio-production-view.test.ts`

```powershell
git add src/renderer/views/AudioProductionView.vue tests/renderer/audio-production-view.test.ts
git commit -m "fix: keep voice volume in editing only"
```

### Task 5: Semantic Subtitle Wrapping

**Files:**
- Create: `backend/app/timeline/subtitle_layout.py`
- Create: `src/shared/subtitle-layout.ts`
- Modify: `backend/app/timeline/exporter.py`
- Create: `backend/tests/test_subtitle_layout.py`
- Test: `backend/tests/test_timeline_exporter.py`
- Create: `tests/shared/subtitle-layout.test.ts`

**Interfaces:**
- Produces Python `layout_subtitle_events(clip, style, canvas_width=1080) -> list[SubtitleClip]`.
- Produces TypeScript `wrapSubtitlePreview(text, style) -> string[]`.

- [ ] **Step 1: Add failing layout fixtures**

```python
def test_wraps_at_semantic_boundary_inside_safe_width():
    clips = layout_subtitle_events(SubtitleClip(0, 4, "每个袋子必须让使用者愿意背，这才是客户品牌曝光的核心"), TextStyle(font_size=58))
    assert all(max(map(len, item.text.split("\\N"))) <= 15 for item in clips)
    assert all(item.text.count("\\N") <= 1 for item in clips)

def test_splits_more_than_two_lines_into_timed_events():
    clips = layout_subtitle_events(SubtitleClip(0, 6, "很长的第一句，很长的第二句，很长的第三句，很长的第四句"), TextStyle(font_size=70))
    assert len(clips) >= 2
    assert clips[0].end_sec == clips[1].start_sec
```

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest backend/tests/test_subtitle_layout.py backend/tests/test_timeline_exporter.py -q`

Expected: FAIL because long text is emitted unchanged.

- [ ] **Step 3: Implement deterministic width budgeting and semantic breaks**

Estimate CJK width from `font_size * scale`, add letter spacing and outline width, and reserve 80-pixel side margins. Prefer punctuation boundaries and keep ASCII/numeric tokens intact. Allocate split-event duration proportional to non-whitespace character count.

- [ ] **Step 4: Mirror preview rules and run tests**

Run: `npx vitest run tests/shared/subtitle-layout.test.ts; python -m pytest backend/tests/test_subtitle_layout.py backend/tests/test_timeline_exporter.py -q`

Expected: PASS and generated ASS contains explicit `\N`.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/timeline/subtitle_layout.py src/shared/subtitle-layout.ts backend/app/timeline/exporter.py backend/tests/test_subtitle_layout.py backend/tests/test_timeline_exporter.py tests/shared/subtitle-layout.test.ts
git commit -m "fix: wrap long subtitles by semantic boundaries"
```

### Task 6: Complete Windows Font Discovery

**Files:**
- Modify: `electron/services/system-font-service.ts`
- Modify: `backend/app/media/font_probe.py`
- Test: `tests/electron/system-font-service.test.ts`
- Test: `backend/tests/test_font_probe.py`

**Interfaces:**
- Produces font records `{ family, path, source, faceIndex? }`.
- Supports `.ttf`, `.otf`, `.ttc`, `.otc`, `.fon`, `.fnt` case-insensitively.

- [ ] **Step 1: Add failing directory, registry, and collection tests**

```ts
expect(scanSystemFonts([windowsFonts, userFonts]).map(x => x.path)).toContain("C:\\Windows\\Fonts\\Legacy.FON");
expect(result.filter(x => x.path.endsWith("Collection.ttc"))).toHaveLength(2);
```

```python
def test_probe_font_collection_returns_each_family(font_collection):
    assert probe_font_families(font_collection) == ["思源黑体", "思源黑体 Heavy"]
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/electron/system-font-service.test.ts; python -m pytest backend/tests/test_font_probe.py -q`

Expected: FAIL for legacy extensions and collection faces.

- [ ] **Step 3: Implement merged source discovery**

Query HKLM and HKCU font registry keys, scan Windows and per-user directories, normalize absolute paths, parse each TTC/OTC face through the Python font probe, and deduplicate by `(family, path, faceIndex)`.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/electron/system-font-service.test.ts; python -m pytest backend/tests/test_font_probe.py -q`

```powershell
git add electron/services/system-font-service.ts backend/app/media/font_probe.py tests/electron/system-font-service.test.ts backend/tests/test_font_probe.py
git commit -m "fix: discover all installed Windows fonts"
```

### Task 7: Preview Background and Accurate Caption Preview

**Files:**
- Copy: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-dae2d4cf-1888-4463-a991-2e709b971755.jpg` to `src/renderer/assets/factory-preview.jpg`
- Modify: `src/renderer/components/editing/PhoneCanvasPreview.vue`
- Modify: `src/renderer/components/editing/MediaSettingsPanel.vue`
- Create: `tests/renderer/phone-canvas-preview.test.ts`

**Interfaces:**
- Consumes `wrapSubtitlePreview` from Task 5.
- Produces a preview background toggle without changing render snapshots.

- [ ] **Step 1: Add failing component tests**

```ts
expect(wrapper.get('[data-testid="preview-background"]').attributes("style")).toContain("factory-preview");
expect(wrapper.findAll('[data-testid="subtitle-line"]')).toHaveLength(2);
await wrapper.get('[data-action="toggle-preview-background"]').trigger("click");
expect(wrapper.classes()).toContain("dark-preview");
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/renderer/phone-canvas-preview.test.ts`

Expected: FAIL because the preview is hard-coded dark and does not share wrapping.

- [ ] **Step 3: Implement preview background, safe area, and two-line rendering**

Import the bundled image through Vite, use `background-size: cover`, render title and subtitle from the current style, and expose a local-only background toggle.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/renderer/phone-canvas-preview.test.ts`

```powershell
git add src/renderer/assets/factory-preview.jpg src/renderer/components/editing/PhoneCanvasPreview.vue src/renderer/components/editing/MediaSettingsPanel.vue tests/renderer/phone-canvas-preview.test.ts
git commit -m "feat: preview text styles on factory background"
```

### Task 8: Canonical Output Naming and Work-Directory Artifacts

**Files:**
- Modify: `electron/services/task-snapshot-service.ts`
- Modify: `electron/repositories/task-repository.ts`
- Modify: `electron/main.ts`
- Modify: `backend/app/tasks/pipeline.py`
- Modify: `backend/app/timeline/exporter.py`
- Test: `tests/electron/task-snapshot-service.test.ts`
- Test: `backend/tests/test_generation_pipeline.py`
- Test: `backend/tests/test_timeline_exporter.py`

**Interfaces:**
- Produces task snapshot fields `mainTitle`, `outputStem`, `workDirectory`.
- Produces output path `outputDirectory/<safe-title>[（n）].mp4`.

- [ ] **Step 1: Add failing naming and artifact-location tests**

```ts
expect(snapshot.outputStem).toBe("同行低价真相");
expect(snapshot.outputPath).toBe("D:/成片/同行低价真相（2）.mp4");
```

```python
assert exporter.ass_path == Path("D:/工作/tasks/task-1/subtitles.ass")
assert not Path("D:/成片/同行低价真相.ass").exists()
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/electron/task-snapshot-service.test.ts; python -m pytest backend/tests/test_generation_pipeline.py backend/tests/test_timeline_exporter.py -q`

Expected: FAIL because output uses task IDs and ASS follows output path.

- [ ] **Step 3: Implement atomic unique naming and artifact cleanup**

Allocate the filename when creating the immutable task snapshot. Pass an explicit task work directory to Python. Write ASS/partial/log files there, atomically move the validated MP4 into the output directory, delete rebuildable artifacts after success, and retain diagnostics after failure.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/electron/task-snapshot-service.test.ts tests/electron/task-repository.test.ts; python -m pytest backend/tests/test_generation_pipeline.py backend/tests/test_timeline_exporter.py -q`

```powershell
git add electron/services/task-snapshot-service.ts electron/repositories/task-repository.ts electron/main.ts backend/app/tasks/pipeline.py backend/app/timeline/exporter.py tests/electron/task-snapshot-service.test.ts backend/tests/test_generation_pipeline.py backend/tests/test_timeline_exporter.py
git commit -m "fix: isolate render artifacts and name final videos"
```

### Task 9: Validated Media Protocol and Fixed Task Preview

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/views/TasksView.vue`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Create: `tests/electron/media-protocol.test.ts`
- Create: `tests/renderer/tasks-view.test.ts`

**Interfaces:**
- Produces `getTaskPreviewUrl(id: string): Promise<string>`.
- Produces `openOutputDirectory(): Promise<{ opened: boolean }>`.

- [ ] **Step 1: Add failing protocol and layout tests**

```ts
expect(await getTaskPreviewUrl(completedTask.id)).toMatch(/^autocut-media:\/\/task\//);
await expect(getTaskPreviewUrl(taskOutsideAllowlist.id)).rejects.toThrow("不允许访问");
expect(wrapper.get('[data-testid="task-preview-pane"]').exists()).toBe(true);
expect(wrapper.find('.el-dialog').exists()).toBe(false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/electron/media-protocol.test.ts tests/renderer/tasks-view.test.ts`

Expected: FAIL because TasksView uses unregistered `autocut-file://` in a modal.

- [ ] **Step 3: Implement allowlisted preview URLs and split layout**

Resolve media by task ID in the main process, never by raw Renderer path. Support HTTP range requests or Electron stream responses so `<video>` seeking works. Update CSP to the single registered scheme. Render a compact left table and sticky right 9:16 player; selecting a completed row updates the source and calls `video.load()`.

- [ ] **Step 4: Add and wire “打开成品文件夹”**

Use the configured output directory and `shell.openPath`, returning a Chinese actionable error if it is missing.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/electron/media-protocol.test.ts tests/renderer/tasks-view.test.ts`

```powershell
git add electron/main.ts electron/preload.ts src/renderer/env.d.ts src/renderer/index.html src/renderer/views/TasksView.vue tests/electron/media-protocol.test.ts tests/renderer/tasks-view.test.ts
git commit -m "fix: play completed videos in fixed task preview"
```

### Task 10: Migration and Cross-Flow Title Consistency

**Files:**
- Modify: `electron/database.ts`
- Modify: `electron/repositories/copywriting-project-repository.ts`
- Modify: `electron/services/task-snapshot-service.ts`
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `src/renderer/views/ScheduleView.vue`
- Create: `tests/electron/database-migration.test.ts`
- Test: `tests/electron/copywriting-project-repository.test.ts`
- Test: `tests/electron/task-snapshot-service.test.ts`

**Interfaces:**
- Consumes canonical `mainTitle` and `topicDescription`.
- Guarantees old records remain readable and new tasks freeze the canonical title.

- [ ] **Step 1: Add a failing migration test**

```ts
expect(migratedOldProject.mainTitle.length).toBeGreaterThanOrEqual(5);
expect(oldTask.snapshot.mainTitle).toBe("旧任务标题");
expect(newTask.snapshot.mainTitle).toBe(project.mainTitle);
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/electron/database-migration.test.ts tests/electron/copywriting-project-repository.test.ts tests/electron/task-snapshot-service.test.ts`

Expected: FAIL because topic description/version metadata and canonical output stem are absent.

- [ ] **Step 3: Add idempotent migration and UI propagation**

Add nullable legacy-safe columns for topic description and source version ID. Derive a compatible title only once for legacy projects. Display canonical titles in editing, task, schedule, and publishing selectors without changing old task snapshots.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/electron/database-migration.test.ts tests/electron/copywriting-project-repository.test.ts tests/electron/task-snapshot-service.test.ts`

```powershell
git add electron/database.ts electron/repositories/copywriting-project-repository.ts electron/services/task-snapshot-service.ts src/renderer/views/TemplatesView.vue src/renderer/views/ScheduleView.vue tests/electron/database-migration.test.ts tests/electron/copywriting-project-repository.test.ts tests/electron/task-snapshot-service.test.ts
git commit -m "feat: migrate canonical titles across production flow"
```

### Task 11: Full Regression, Real Render, and Installer Verification

**Files:**
- Modify: `docs/用户操作手册.md`
- Modify: `docs/故障排查手册.md`
- Create: `docs/0.5.4-标题字幕预览验收记录.md`
- Modify: `package.json`

**Interfaces:**
- Verifies all interfaces produced by Tasks 1–10.

- [ ] **Step 1: Run static and automated checks**

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run test:python`

Expected: all tests pass with no skipped new tests.

- [ ] **Step 2: Build production bundles**

Run: `npm run build`

Expected: Electron main, preload, and Renderer build successfully.

- [ ] **Step 3: Execute real workflow acceptance**

Use one real persona and five generated topics. Verify progress lockout and select-all, generate at least three spoken scripts, clone one archived script as a new version, create tasks, and render at least three videos serially. Confirm:

```text
1080x1920
30 fps
H.264 video
AAC audio
all long captions stay inside safe area
task title == overlay short title == MP4 stem
```

- [ ] **Step 4: Inspect filesystem boundaries**

Run: `Get-ChildItem <configured-output-directory>`

Expected: only final MP4 files with human-readable short titles.

Run: `Get-ChildItem <configured-work-directory>\tasks -Recurse`

Expected: diagnostics are isolated by task ID; successful-task rebuildable ASS/partial files are absent.

- [ ] **Step 5: Package and perform an installed-build smoke test**

Run: `npm run dist:win`

Install the generated x64 package over the current installation, launch it, generate topics, open the output directory, and play a completed video in the fixed right preview.

- [ ] **Step 6: Update documentation and commit**

Document short-title rules, archive version editing, subtitle wrapping, font sources, work/output directory separation, and preview troubleshooting.

```powershell
git add package.json docs/用户操作手册.md docs/故障排查手册.md docs/0.5.4-标题字幕预览验收记录.md
git commit -m "docs: record title subtitle and preview acceptance"
```

## Final Gate

- [ ] `git diff --check` passes.
- [ ] `npm run check` passes.
- [ ] Installed build displays all required Chinese UI.
- [ ] Three real videos play in Windows and in the task preview.
- [ ] No finished task is marked completed before ffprobe validation.
- [ ] Existing benchmark artifacts remain untouched and untracked.
