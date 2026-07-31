# 成片与发布闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可解释进度、可验证成片、可复用字幕标题样式以及可人工接管发布的 Windows 安装版。

**Architecture:** 后端任务状态机区分等待编码与实际编码，FFmpeg 使用临时文件和 ffprobe 提交协议；Electron 负责持久化、断线恢复和跨进程单实例；Renderer 只消费类型化状态与设置。发布器使用语义定位和人工接管降级。

**Tech Stack:** Electron、Vue 3、TypeScript、SQLite、Python 3.11、FastAPI、FFmpeg/ffprobe、Playwright、Vitest、Pytest。

## Global Constraints

- Windows 11 x64，本地单机。
- 阶段变化立即更新；等待和编码阶段每 5 秒更新一次反馈。
- 正式 `.mp4` 必须通过 ffprobe 后才能暴露给 UI 和发布器。
- 不绕过登录、验证码和平台风控。

---

### Task 1: 可解释任务状态机

**Files:**
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/app/tasks/secure_runtime.py`
- Modify: `electron/repositories/task-repository.ts`
- Modify: `electron/main.ts`
- Modify: `src/shared/contracts.ts`
- Test: `backend/tests/test_generation_worker.py`
- Test: `tests/electron/task-repository.test.ts`

**Interfaces:**
- Produces: `waiting_encoding` 任务状态、5 秒心跳事件、事件流断线恢复。

- [ ] 写失败测试：第二个任务在锁外显示 `waiting_encoding`，每 5 秒产生心跳，取得锁后才显示 `encoding`。
- [ ] 运行定向测试并确认失败。
- [ ] 实现等待状态、心跳、跨进程编码锁和 Electron 重连查询。
- [ ] 运行后端与 Electron 状态机测试。
- [ ] 提交任务状态机修改。

### Task 2: 原子成片与媒体校验

**Files:**
- Modify: `backend/app/timeline/exporter.py`
- Modify: `backend/app/tasks/pipeline.py`
- Test: `backend/tests/test_timeline_exporter.py`
- Test: `backend/tests/test_timeline_integration.py`

**Interfaces:**
- Produces: `Exporter.export()` 仅在 ffprobe 校验后提交最终路径。

- [ ] 写失败测试：编码目标为 `.partial.mp4`，失败和取消清理临时文件，校验失败不生成正式文件。
- [ ] 运行定向测试并确认失败。
- [ ] 实现临时输出、进程树终止、ffprobe 校验和 `os.replace`。
- [ ] 运行真实短视频合成、取消和损坏输出测试。
- [ ] 提交成片生命周期修改。

### Task 3: 字幕标题坐标与样式模板

**Files:**
- Modify: `src/shared/media-style.ts`
- Modify: `src/renderer/components/editing/SubtitleStyleEditor.vue`
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `electron/database.ts`
- Create: `electron/repositories/style-preset-repository.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `backend/app/timeline/exporter.py`
- Test: `tests/renderer/subtitle-style-editor.test.ts`
- Test: `backend/tests/test_timeline_exporter.py`

**Interfaces:**
- Produces: `positionX`, `positionY` 和持久化的组合样式模板 CRUD。

- [ ] 写失败测试：坐标进入草稿和 ASS `\pos(x,y)`，模板重启后可读取。
- [ ] 运行定向测试并确认失败。
- [ ] 实现 schema、数据库迁移、IPC、编辑器和预览定位。
- [ ] 运行共享类型、Repository、Renderer 和后端测试。
- [ ] 提交字幕标题样式修改。

### Task 4: AI 短标题闭环

**Files:**
- Modify: `backend/app/copywriting/rewrite_service.py`
- Modify: `backend/app/main.py`
- Modify: `src/shared/creation-draft.ts`
- Modify: `src/renderer/views/CopywritingView.vue`
- Modify: `electron/services/task-snapshot-service.ts`
- Modify: `backend/app/tasks/pipeline.py`
- Test: `backend/tests/test_copywriting.py`
- Test: `tests/renderer/copywriting-view.test.ts`
- Test: `tests/electron/task-snapshot-service.test.ts`

**Interfaces:**
- Produces: `mainTitle: string`，严格 5–6 个汉字并有本地兜底。

- [ ] 写失败测试：模型结果和异常结果都生成合法短标题。
- [ ] 运行测试并确认失败。
- [ ] 实现提示词、解析、兜底、草稿与任务快照传递。
- [ ] 验证预览和最终 ASS 使用该标题。
- [ ] 提交 AI 标题修改。

### Task 5: 字体完整扫描

**Files:**
- Modify: `electron/services/system-font-service.ts`
- Test: `tests/electron/system-font-service.test.ts`

**Interfaces:**
- Produces: 合并 TTF/OTF/TTC/OTC 的 `SystemFont[]`。

- [ ] 写失败测试：用户字体目录、集合字体和重复字体正确处理。
- [ ] 运行测试并确认失败。
- [ ] 实现注册表与目录扫描、集合字体解析、排序和去重。
- [ ] 在本机对比扫描数量与 Windows Fonts。
- [ ] 提交字体扫描修改。

### Task 6: 中文排期与记录删除

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/views/ScheduleView.vue`
- Modify: `electron/repositories/publish-repository.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Test: `tests/electron/publish-repository.test.ts`
- Test: `tests/renderer/schedule-view.test.ts`

**Interfaces:**
- Produces: 简体中文日期控件和 `deletePublishJob(id)`。

- [ ] 写失败测试：取消/失败记录可删，执行中记录拒绝删除。
- [ ] 运行测试并确认失败。
- [ ] 接入 `zh-cn` locale、中文格式和删除 IPC/UI。
- [ ] 运行 Renderer 与 Electron 测试。
- [ ] 提交排期修改。

### Task 7: 抖音发布器恢复与人工接管

**Files:**
- Modify: `backend/app/publisher/adapters.py`
- Modify: `backend/app/publisher/playwright_page.py`
- Modify: `backend/app/publisher/service.py`
- Test: `backend/tests/test_publishers.py`
- Test: `backend/tests/test_playwright_page.py`

**Interfaces:**
- Produces: 中文语义选择器、多级回退、`needs_user` 人工接管结果。

- [ ] 写失败测试：新版抖音 DOM 可填写，未匹配时返回人工接管且保留诊断。
- [ ] 运行测试并确认失败。
- [ ] 修复乱码选择器，增加 role/text/placeholder 回退和发布前视频校验。
- [ ] 实现失败窗口保留、截图、URL 和中文原因。
- [ ] 提交发布器修改。

### Task 8: 全量验证与 Windows 交付

**Files:**
- Modify: `package.json`
- Modify: `backend/app/build_info.py`
- Modify: `electron/backend-manager.ts`

**Interfaces:**
- Produces: 新版本安装包和可复现验收记录。

- [ ] 运行 Vitest、TypeScript、Pytest 全量回归。
- [ ] 真实并行创建四条任务，验证排队、5 秒心跳、完成、取消和失败清理。
- [ ] 使用 ffprobe 校验所有完成成片，确认不存在不可播放正式 MP4。
- [ ] 验证字幕坐标、样式模板、AI 标题、中文日期和发布人工接管。
- [ ] 打包、安装并核对安装文件哈希与版本握手。
