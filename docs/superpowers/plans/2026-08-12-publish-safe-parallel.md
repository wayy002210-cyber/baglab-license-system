# Publish Safe Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变封面和提交顺序的前提下，让标题话题填写与视频上传重叠，并改善队列/登录提示。

**Architecture:** 调整发布适配器的串行步骤顺序，使元数据填写先于上传完成确认；前端在任务创建后切换队列标签，并根据 `needs_user` 渲染明确提示。保持现有接口和状态模型不变。

**Tech Stack:** Python、pytest、Vue 3、TypeScript、Vitest。

## Global Constraints

- 不改封面、定时发布和最终提交的既有顺序。
- 视频上传未确认完成时不得进入封面步骤。
- 本轮不打包。

---

### Task 1: 安全并行发布编排

**Files:**
- Modify: `backend/app/publisher/adapters.py`
- Test: `backend/tests/test_publishers.py`

- [ ] 增加失败测试，断言动作顺序为上传、填写元数据、等待上传完成、上传封面。
- [ ] 运行专项测试并确认旧实现失败。
- [ ] 最小调整适配器步骤顺序。
- [ ] 运行发布器回归测试。

### Task 2: 发布队列与登录提示

**Files:**
- Modify: `src/renderer/views/ScheduleView.vue`
- Test: `tests/schedule-view.test.ts`

- [ ] 增加失败测试，验证创建任务后切换到发布队列。
- [ ] 增加 `needs_user` 明确提示并验证继续发布按钮仍存在。
- [ ] 运行前端专项测试及 TypeScript 类型检查。

### Task 3: 联合验证

**Files:**
- Test: `backend/tests/test_publishers.py`
- Test: `backend/tests/test_playwright_page.py`
- Test: `tests/schedule-view.test.ts`

- [ ] 运行相关 Python 与前端测试。
- [ ] 确认未生成安装包，交由用户进行开发模式真实链路测试。
