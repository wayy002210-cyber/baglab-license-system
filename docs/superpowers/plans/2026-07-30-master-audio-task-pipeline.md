# 单条主音频与任务流水线修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将完整口播稿一次生成一条连续主音频，并修复任务合成空值错误，使当前真实草稿能够生成可播放 MP4。

**Architecture:** 沿用 `audioSegments` 数据库字段，但新流程只保存一个覆盖全文的主音频元素。镜头文本独立拆分，纯函数按字符权重把主音频总时长分配给镜头；后端复用主音频、只铺一条人声音轨。

**Tech Stack:** Vue 3、TypeScript、Vitest、Python 3.11、Pytest、FastAPI、MiniMax、FFmpeg。

## Global Constraints

- Windows 11 x64 本地单机运行。
- 完整脚本只允许一次成片 TTS 调用。
- 旧数据库和旧任务快照必须可读取，不删除旧音频或成片。
- 新任务必须复用已生成主音频。
- `bgm=null` 必须按未配置处理。
- 所有新增行为先写失败测试，再做最小实现。

---

### Task 1: 修复任务空背景音乐崩溃

**Files:**
- Modify: `backend/app/tasks/pipeline.py`
- Test: `backend/tests/test_generation_pipeline.py`

**Interfaces:**
- Consumes: `TaskExecutionRequest.snapshot["bgm"]`，可能为 `None`。
- Produces: `GenerationPipeline.compose()` 在无背景音乐时仍返回合法 `Project`。

- [ ] **Step 1: 写失败测试**

构造 `snapshot={"bgm": None, "media": {"bgmVolume": 0.16}}`，调用 `compose()`，断言不抛异常且 `project.bgm_volume == 0.16`。

- [ ] **Step 2: 验证测试因 `None.get` 失败**

Run: `python -m pytest backend/tests/test_generation_pipeline.py -q`

- [ ] **Step 3: 最小修复**

将背景音乐设置读取改为：

```python
bgm_settings = request.snapshot.get("bgm") or {}
media_settings = request.snapshot.get("media") or {}
```

后续只从这两个字典读取配置。

- [ ] **Step 4: 运行测试**

Run: `python -m pytest backend/tests/test_generation_pipeline.py -q`

### Task 2: 建立单条主音频和镜头时长分配器

**Files:**
- Create: `src/renderer/audio/master-audio.ts`
- Modify: `src/renderer/editing/shot-builder.ts`
- Test: `tests/renderer/master-audio.test.ts`
- Test: `tests/renderer/shot-builder.test.ts`

**Interfaces:**
- Produces: `buildMasterAudioSegment(text, voice): DraftAudioSegment`
- Produces: `allocateShotDurations(texts, totalDurationSec): number[]`
- Consumes: 完整文案、声音参数和主音频总时长。

- [ ] **Step 1: 写主音频失败测试**

断言完整文案生成一个且仅一个元素，`sourceStart=0`、`sourceEnd=text.length`，同文案同参数 ID 稳定，参数变化后 ID 改变。

- [ ] **Step 2: 写时长分配失败测试**

输入三个不同字符数文本与 30 秒，断言输出三个正数、长文本获得更长时长、总和严格为 30 秒。

- [ ] **Step 3: 验证测试失败**

Run: `npm exec vitest run -- tests/renderer/master-audio.test.ts tests/renderer/shot-builder.test.ts`

- [ ] **Step 4: 实现纯函数**

主音频元素复用现有 schema；时长分配先给每镜头最小 `0.5` 秒，再按去空白字符权重分配剩余时长，最后一个镜头吸收浮点余差。

- [ ] **Step 5: 运行测试**

Run: `npm exec vitest run -- tests/renderer/master-audio.test.ts tests/renderer/shot-builder.test.ts`

### Task 3: 将音频页面改为整篇一次生成

**Files:**
- Modify: `src/renderer/views/AudioProductionView.vue`
- Modify: `src/renderer/components/audio/MasterAudioPlayer.vue`
- Remove usage: `src/renderer/components/audio/AudioSegmentList.vue`
- Test: `tests/renderer/audio-production-view.test.ts`

**Interfaces:**
- Consumes: `buildMasterAudioSegment()`。
- Produces: 一个 `audioSegments[0]`，一次 `window.autocut.synthesizeVoice()` 调用。

- [ ] **Step 1: 写失败测试**

加载包含完整文案的草稿，点击生成，断言 `synthesizeVoice` 仅调用一次且请求文本等于完整文案；保存后的 `audioSegments` 长度为 1。

- [ ] **Step 2: 验证旧实现多次调用**

Run: `npm exec vitest run -- tests/renderer/audio-production-view.test.ts`

- [ ] **Step 3: 实现整篇生成**

删除 `rebuildSegments()` 的分段循环和单段重试入口。生成前构造一个主元素，状态依次为 `generating/ready/failed`，成功后写入 `audioPath` 与 `durationSec` 并立即保存。

- [ ] **Step 4: 简化界面**

只保留顶部主播放器、生成/重新生成按钮、单一进度和中文失败引导；去掉段数和逐段列表。

- [ ] **Step 5: 运行测试**

Run: `npm exec vitest run -- tests/renderer/audio-production-view.test.ts`

### Task 4: 镜头编辑使用主音频总时长

**Files:**
- Modify: `src/renderer/editing/shot-builder.ts`
- Modify: `src/renderer/views/TemplatesView.vue`
- Test: `tests/renderer/shot-builder.test.ts`
- Test: `tests/renderer/templates-view.test.ts`

**Interfaces:**
- Consumes: `audioSegments[0].durationSec` 与拆分后的镜头文案。
- Produces: 每个镜头的 `durationSec`，总和等于主音频时长；所有镜头可共享同一 `audioSegmentId`。

- [ ] **Step 1: 写失败测试**

草稿包含一条 30 秒主音频和三段镜头文字，断言生成三个镜头、共享主音频 ID、时长总和为 30 秒。

- [ ] **Step 2: 验证测试失败**

Run: `npm exec vitest run -- tests/renderer/shot-builder.test.ts tests/renderer/templates-view.test.ts`

- [ ] **Step 3: 更新镜头构建**

不再把每个 `audioSegments` 元素当作镜头。始终从完整文案拆镜头，再调用 `allocateShotDurations()`。

- [ ] **Step 4: 更新页面校验**

进入任务前只要求唯一主音频为 `ready`，不再逐镜头查找配音段。

- [ ] **Step 5: 运行测试**

Run: `npm exec vitest run -- tests/renderer/shot-builder.test.ts tests/renderer/templates-view.test.ts`

### Task 5: 后端任务复用主音频并只铺一条声音轨

**Files:**
- Modify: `backend/app/tasks/pipeline.py`
- Test: `backend/tests/test_generation_pipeline.py`

**Interfaces:**
- Consumes: `snapshot.audioSegments[0]`、`snapshot.copywriting.text`、`shotPlans`。
- Produces context: `masterVoicePath: Path`、`durations: list[float]`。
- Produces project: `voice_clips` 长度固定为 1。

- [ ] **Step 1: 写复用失败测试**

提供 ready 主音频，断言 `voice.synthesize` 调用次数为零、探测结果不覆盖快照时长。

- [ ] **Step 2: 写补生成失败测试**

不提供主音频时，断言 TTS 只调用一次，请求文本为全部镜头文案拼成的完整脚本。

- [ ] **Step 3: 写合成失败测试**

三个镜头断言视频/字幕为三个、人声音轨为一个且从 0 秒开始。

- [ ] **Step 4: 验证测试失败**

Run: `python -m pytest backend/tests/test_generation_pipeline.py -q`

- [ ] **Step 5: 实现主音频流水线**

`generate_voice()` 复用或补生成主音频；使用字符权重分配镜头时长。`compose()` 只追加 `AudioClip(masterVoicePath, 0)`。

- [ ] **Step 6: 运行测试**

Run: `python -m pytest backend/tests/test_generation_pipeline.py -q`

### Task 6: 任务快照、错误中文化与兼容

**Files:**
- Modify: `src/renderer/views/TasksView.vue`
- Modify: `src/renderer/lib/user-error.ts`
- Modify: `backend/app/tasks/worker.py`
- Test: `tests/renderer/user-error.test.ts`
- Test: `backend/tests/test_generation_worker.py`

**Interfaces:**
- Consumes: 当前创作草稿或旧任务快照。
- Produces: 新任务包含主音频；错误格式包含阶段与中文说明。

- [ ] **Step 1: 写失败测试**

后端阶段抛出 `AttributeError` 时，任务错误必须包含当前中文阶段；前端不得直接展示 `NoneType`。

- [ ] **Step 2: 验证测试失败**

Run: `python -m pytest backend/tests/test_generation_worker.py -q`
Run: `npm exec vitest run -- tests/renderer/user-error.test.ts`

- [ ] **Step 3: 实现错误包装**

Worker 保存 `阶段名称：原因`；Renderer 将遗留 Python 空值错误转换为“任务快照缺少必要配置，请重新创建任务”。

- [ ] **Step 4: 运行测试**

Run: `python -m pytest backend/tests/test_generation_worker.py -q`
Run: `npm exec vitest run -- tests/renderer/user-error.test.ts`

### Task 7: 全量回归、真实任务与安装包

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/<version>-单条主音频任务验收记录.md`

**Interfaces:**
- Produces: 可安装的下一版本 Windows x64 安装包与验收记录。

- [ ] **Step 1: 全量回归**

Run: `npm run check`

- [ ] **Step 2: 使用当前真实草稿生成主音频**

验证 MiniMax 成片配音请求次数为 1、播放器可播放、草稿中 `audioSegments.length == 1`。

- [ ] **Step 3: 创建并运行真实任务**

确认任务依次经过准备文案、复用配音、选片、合成、编码，最终生成可播放 MP4。

- [ ] **Step 4: 媒体探测**

用 ffprobe 验证 MP4 为 1080×1920、30fps、H.264/AAC，视频时长与主音频允许误差小于 0.2 秒。

- [ ] **Step 5: 构建和校验安装包**

Run: `node scripts/build-installer.mjs`
Run: `node scripts/verify-packaged-backend.mjs`
Run: `node scripts/verify-unpacked-app.mjs`

- [ ] **Step 6: 提交**

提交代码、测试、版本号和验收记录。
