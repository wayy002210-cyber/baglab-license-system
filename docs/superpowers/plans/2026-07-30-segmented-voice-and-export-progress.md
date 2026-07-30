# 分镜配音与可靠导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 逐镜头生成配音并以真实音频时长驱动画面，同时消除 FFmpeg 75% 卡死、启用正确的 AMD 硬件编码并显示真实导出进度。

**Architecture:** 文案先形成稳定的 `shotPlans`，配音阶段为每个镜头独立调用 MiniMax 并保存 `voiceClips` 与 `durations`；时间线按镜头起点排列音频、视频和字幕。导出器使用 FFmpeg `-progress pipe:1` 持续读取进度，独立排空错误输出，并通过真实试编码选择可工作的硬件编码器。

**Tech Stack:** Python 3.11、FastAPI、Pydantic、FFmpeg/ffprobe、Pytest、Electron SSE。

## Global Constraints

- Windows 11 x64，本地单机运行。
- MiniMax 每个镜头独立合成，但最多三个 TTS 请求并发。
- 编码任务仍保持全局单并发。
- 进度和错误必须使用中文，且错误包含可操作的处理建议。
- 不修改用户已有 Persona、模板、素材和任务数据。

---

### Task 1: 逐镜头配音与时间线

**Files:**
- Modify: `backend/app/tasks/pipeline.py`
- Modify: `backend/tests/test_generation_pipeline.py`

**Interfaces:**
- Consumes: `context["shotPlans"]` 与 `snapshot.voice`
- Produces: `context["voiceClips"]: list[Path]`、`context["durations"]: list[float]`

- [ ] 写失败测试：两个镜头必须触发两次 TTS，分别使用镜头文本。
- [ ] 运行 `pytest backend/tests/test_generation_pipeline.py -q`，确认旧的整篇单次合成逻辑导致失败。
- [ ] 修改 `generate_voice`，复用同索引的有效缓存，否则按镜头合成；每段实际时长写入 `durations`。
- [ ] 修改 `compose`，按累计起点创建多个 `AudioClip`，不再使用 `masterVoicePath`。
- [ ] 增加单镜头失败能指出镜头序号的测试并实现中文错误包装。
- [ ] 运行测试确认通过。

### Task 2: FFmpeg 防死锁与真实进度

**Files:**
- Modify: `backend/app/timeline/exporter.py`
- Modify: `backend/tests/test_timeline_exporter.py`
- Modify: `backend/app/tasks/pipeline.py`
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/tests/test_generation_worker.py`

**Interfaces:**
- `Exporter.export(..., on_progress: Callable[[float], None] | None = None)`
- `on_progress` 接收 `0.0..1.0` 的导出阶段比例。

- [ ] 写失败测试：模拟 FFmpeg progress 输出，断言回调收到单调递增的比例。
- [ ] 写失败测试：大量 stderr 输出时导出仍能结束且保留末尾错误文本。
- [ ] 给命令加入 `-progress pipe:1 -nostats`。
- [ ] 持续读取 stdout 的 `out_time_ms`/`progress=end`，后台线程持续排空 stderr。
- [ ] 将导出比例映射为任务总进度 `75..99` 并通过现有事件通道发送。
- [ ] 保留取消、超时与错误尾部诊断，运行相关测试。

### Task 3: 真实硬件编码器探测

**Files:**
- Modify: `backend/app/timeline/exporter.py`
- Modify: `backend/tests/test_timeline_exporter.py`
- Modify: `backend/app/media/__init__.py`

**Interfaces:**
- `EncoderDetector.detect()` 返回经过试编码验证的 `h264_amf`、`h264_nvenc`、`h264_qsv` 或 `libx264`。

- [ ] 写失败测试：编码器虽出现在列表中但试编码失败时必须跳过。
- [ ] 写失败测试：AMD AMF 试编码成功时选择 `h264_amf`。
- [ ] 用 16×16、0.1 秒 lavfi 色块执行短试编码，按 Windows GPU 环境排序候选项。
- [ ] 为 AMF、NVENC、QSV、libx264 分别生成兼容的 preset 参数，避免对 AMF 传入 NVENC 的 `p4`。
- [ ] 运行编码器与媒体接口测试。

### Task 4: 回归与真实素材验收

**Files:**
- Modify: `backend/tests/test_timeline_integration.py`
- Modify: `docs/troubleshooting.md`（若文件不存在则创建）

**Interfaces:**
- 真实输出要求：1080×1920、30fps、H.264/AAC，音频与镜头总时长一致。

- [ ] 运行后端全量测试。
- [ ] 运行前端类型检查和测试，确认任务事件类型兼容。
- [ ] 使用当前任务快照和真实素材重新生成一条约58秒视频。
- [ ] 用 ffprobe 验证视频规格、音轨、时长和可播放性。
- [ ] 记录硬件编码器、平均速度、总耗时及 CPU 回退表现。
- [ ] 构建 Windows 安装包并执行安装版冒烟测试。
