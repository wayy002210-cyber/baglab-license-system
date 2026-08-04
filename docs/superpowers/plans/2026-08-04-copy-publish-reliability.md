# 文案与平台定时发布可靠性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复文案编辑与媒体样式回归，并实现抖音、视频号的平台内定时发布闭环。

**Architecture:** 文案格式化和发音稿放在 Python 纯函数层；编辑状态保存在 Electron Repository；平台发布扩展统一 PublisherPage 接口，由抖音和视频号适配器各自处理页面差异。所有外部页面行为先由本地仿真页测试。

**Tech Stack:** Electron、Vue 3、TypeScript、SQLite、Python 3.11、FastAPI、Playwright、Vitest、Pytest。

## Global Constraints

- Windows 11 x64，本地单用户。
- 未指定发布时间时固定为创建时刻后 20 分钟。
- 不绕过验证码、登录验证或平台风控。
- 字幕原文与配音发音稿分离。
- 每行文案 10–25 个汉字并带中文标点。

---

### Task 1: 文案格式、违禁词与发音稿

**Files:** `backend/app/copywriting/spoken_copy.py`、`backend/app/copywriting/compliance.py`、`backend/app/voice/pronunciation.py`、`backend/app/tasks/pipeline.py` 及对应 Pytest。

- [ ] 写失败测试：短句合并、长句拆分、标点补齐且不丢字。
- [ ] 运行测试并确认因现有格式器只做最大长度切割而失败。
- [ ] 实现 10–25 字语义行格式器并更新生成 Prompt。
- [ ] 写失败测试：发音词典只改变 TTS 文本，不改变字幕。
- [ ] 实现发音稿转换和设置持久化接口。
- [ ] 写违禁词接口契约与错误透传测试并修复。
- [ ] 运行文案、配音及 API 测试。

### Task 2: 归档复制编辑状态

**Files:** `src/renderer/views/CopywritingView.vue`、copywriting renderer tests。

- [ ] 写失败测试：点击归档复制后切换自定义模式并回填标题正文。
- [ ] 确认测试失败。
- [ ] 实现 review 副本选中、模式切换、滚动定位和字段回填。
- [ ] 验证原归档和历史任务不变。

### Task 3: 字体、文字效果与混音状态

**Files:** `electron/services/system-font-service.ts`、`PhoneCanvasPreview.vue`、`TemplatesView.vue`、相关 Vitest。

- [ ] 写失败测试：中文注册表字体名无乱码。
- [ ] 改用 PowerShell UTF-8 JSON 字体清单并保留目录扫描降级。
- [ ] 写失败测试：仅 blur、描边宽度和阴影偏移变化均改变预览样式。
- [ ] 实现稳定的多层 text-shadow/滤镜预览。
- [ ] 写失败测试：拖动人声音量更新草稿并重载保持。
- [ ] 去掉固定 `voice-volume=1`，绑定持久化媒体设置。
- [ ] 运行字体、样式和草稿测试。

### Task 4: 发布领域模型与默认时间

**Files:** `backend/app/publisher/adapters.py`、Electron publish repository/scheduler、shared contracts 及测试。

- [ ] 写失败测试：空时间被固化为当前时间后 20 分钟且立即可领取。
- [ ] 扩展 PublishRequest，加入平台计划时间和时区。
- [ ] 调整调度查询，使平台排期任务立即执行一次上传配置。
- [ ] 验证幂等键避免重复提交。

### Task 5: 抖音与视频号平台定时发布

**Files:** `backend/app/publisher/adapters.py`、Playwright page wrapper、publisher tests/fixtures。

- [ ] 建立本地抖音仿真页，写上传、标题、话题、定时和成功确认失败测试。
- [ ] 实现 DouyinPublisher 多候选语义选择器和日期时间设置。
- [ ] 建立视频号仿真页并写相同状态流测试。
- [ ] 实现 WechatChannelsPublisher。
- [ ] 写登录失效、验证码、页面变化进入 needs_user 的测试。
- [ ] 确保浏览器上下文和截图保留。

### Task 6: 发布排期 UI 与错误反馈

**Files:** `ScheduleView.vue`、`user-error.ts` 及 renderer tests。

- [ ] 写失败测试：空时间 UI 显示“默认 20 分钟后”。
- [ ] 自动回填任务短标题和建议话题。
- [ ] 展示平台定时配置阶段、具体错误和人工接管入口。
- [ ] 验证中文日期、删除和重试操作。

### Task 7: 回归、安装与真实接管点

- [ ] 运行聚焦 Vitest/Pytest。
- [ ] 运行 `npm run check`。
- [ ] 构建 Windows 安装包。
- [ ] 运行安装包内置后端健康检查。
- [ ] 使用测试账号完成抖音、视频号各一次扫码登录和平台定时发布；若出现验证码，仅此步骤请求用户接管。
- [ ] 记录安装包 SHA256 并提交代码。

