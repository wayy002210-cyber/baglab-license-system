# Production Workflow V2 Implementation Plan

**Goal:** 交付从人设、文案、音频、镜头、成片到抖音/视频号发布的可诊断生产闭环。

**Architecture:** 以持久化创作状态机连接各页面；远程能力通过带错误码的服务边界调用；音频与生成使用可恢复任务；发布浏览器由长生命周期会话管理器维护。所有功能先写失败测试，再实现，再执行模块和全量回归。

## Task 1：AI 配置健康检查与模型能力

**Files**
- Modify: `backend/app/copywriting/bailian.py`
- Modify: `backend/app/main.py`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/views/SettingsView.vue`
- Test: `backend/tests/test_bailian.py`
- Test: `backend/tests/test_copywriting_api.py`

1. 添加无效密钥、无权限模型、限流、超时和非结构化 DeepSeek 返回的失败测试。
2. 建立模型能力表，DeepSeek 不发送 `response_format`。
3. 实现 JSON 容错提取、Pydantic 校验和两次格式修复。
4. 增加百炼连接测试接口与设置页状态。
5. 验证日志不包含密钥。

## Task 2：创作草稿状态机与可靠跳转

**Files**
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/composables/useCreationDraft.ts`
- Modify: `src/renderer/views/CopywritingView.vue`
- Modify: `electron/repositories/creation-draft-repository.ts`
- Test: `src/renderer/composables/__tests__/useCreationDraft.test.ts`
- Test: `src/renderer/views/__tests__/CopywritingView.test.ts`

1. 测试保存失败可见、重试、成功后跳转和重启恢复。
2. 增加草稿阶段迁移校验及保存状态。
3. 自动保存捕获异常，消除未处理 Promise。
4. 自定义文案只在持久化成功后进入音频页。

## Task 3：文案生成与结构化改写

**Files**
- Modify: `backend/app/copywriting/service.py`
- Modify: `backend/app/main.py`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/views/CopywritingView.vue`
- Test: `backend/tests/test_copywriting_service.py`
- Test: `src/renderer/views/__tests__/CopywritingView.test.ts`

1. 测试五选题、200–1000 字文案、结构保持改写和中文错误指引。
2. 增加结构化改写接口和不可变变体结果。
3. 将诊断 ID、错误码和重试操作接入页面。
4. 验证参考脚本仅作为上下文且不被原样复刻。

## Task 4：整篇音频任务与播放器

**Files**
- Modify: `src/shared/contracts.ts`
- Modify: `backend/app/voice/service.py`
- Modify: `backend/app/main.py`
- Modify: `src/renderer/views/AudioProductionView.vue`
- Create: `src/renderer/components/audio/MasterAudioPlayer.vue`
- Test: `backend/tests/test_voice_service.py`
- Test: `src/renderer/components/audio/__tests__/MasterAudioPlayer.test.ts`

1. 测试分段生成、失败重试、缓存失效和合并预览。
2. 增加整篇音频任务状态及真实段落进度。
3. 实现顶部生成、播放、暂停、重播和时间轴。
4. 只有整篇预览就绪才允许进入镜头剪辑。

## Task 5：音色卡片、互斥试听与声音克隆

**Files**
- Modify: `src/renderer/components/audio/VoiceLibrary.vue`
- Modify: `src/renderer/components/audio/VoiceCloneDialog.vue`
- Modify: `src/renderer/views/AudioProductionView.vue`
- Test: `src/renderer/components/audio/__tests__/VoiceLibrary.test.ts`

1. 测试单播放器互斥、从头播放、再次点击停止和播放态。
2. 将音色改为可搜索卡片布局。
3. 保留情感、语速、音调；模型移到设置。
4. 克隆音色完成后立即进入卡片库并可试听。

## Task 6：镜头模板与一键改写

**Files**
- Modify: `src/renderer/views/TemplatesView.vue`
- Modify: `src/renderer/components/editing/TemplateLibrary.vue`
- Modify: `src/renderer/components/editing/ShotEditor.vue`
- Modify: `src/renderer/editing/shot-builder.ts`
- Test: `src/renderer/views/__tests__/TemplatesView.test.ts`

1. 测试模板 CRUD、应用、另存和当前草稿隔离。
2. 测试从文案拆分、结构化改写、镜头排序和素材分类。
3. 删除模糊的“保存镜头方案”，改为“保存为模板”。
4. 增加保存当前创作和创建混剪任务的明确状态。

## Task 7：统一混音与成片参数

**Files**
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/components/editing/MediaSettingsPanel.vue`
- Modify: `backend/app/media/timeline.py`
- Test: `src/renderer/components/editing/__tests__/MediaSettingsPanel.test.ts`
- Test: `backend/tests/test_timeline.py`

1. 测试人声和 BGM 音量同区调节并进入任务快照。
2. 支持 BGM 单曲/文件夹和 FLAC。
3. 验证 FFmpeg 混音、循环、淡入淡出和响度关系。
4. 保持本机字体、标题、字幕实时预览。

## Task 8：平台领域迁移

**Files**
- Modify: `src/shared/contracts.ts`
- Modify: `electron/database.ts`
- Modify: `electron/repositories/publish-repository.ts`
- Modify: `backend/app/publisher/service.py`
- Delete/Replace: Xiaohongshu adapter
- Test: repository and backend platform tests

1. 将平台收敛为 `douyin | wechat_channels`。
2. 保留旧数据库可迁移，不让历史小红书记录破坏启动。
3. 增加视频号入口 URL 和适配器骨架。
4. 清理前端小红书入口和文案。

## Task 9：持久登录浏览器会话

**Files**
- Create: `backend/app/publisher/session_manager.py`
- Modify: `backend/app/publisher/playwright_page.py`
- Modify: `backend/app/main.py`
- Modify: `src/renderer/views/PublishAccountsView.vue`
- Test: `backend/tests/test_publisher_session_manager.py`
- Test: `src/renderer/views/__tests__/PublishAccountsView.test.ts`

1. 测试账号先保存、卡片点击登录、状态轮询和应用退出清理。
2. 浏览器会话从同步长请求改为后台会话 ID。
3. 保存 persistent context，登录态跨重启恢复。
4. 登录、验证码、风控显示 `needs_user`，不自动绕过。

## Task 10：抖音/视频号发布与排期

**Files**
- Modify/Create: platform publisher adapters
- Modify: `backend/app/publisher/service.py`
- Modify: scheduler and publish views
- Test: local simulator Playwright flows

1. 在本地仿真页面测试选择器回退、上传、标题、话题、定时和成功判定。
2. 对同一账号串行执行并引入幂等键。
3. 平台无定时权限时进入 `needs_user`。
4. 失败保存脱敏截图、URL、步骤和可重试状态。

## Task 11：回归、桌面验收与发布

1. 运行 TypeScript 类型检查、Vitest、Pytest、构建和打包。
2. 使用真实 Electron 窗口验收全部页面和错误路径。
3. 使用有效百炼/MiniMax配置执行真实文案与音频验收。
4. 构建 Windows 安装包并从干净安装路径启动。
5. 记录 SHA256、安装包路径、已自动验收项和仅需用户扫码的最终清单。
