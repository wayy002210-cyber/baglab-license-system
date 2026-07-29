# AutoCut Studio

Windows 本地优先的智能混剪与内容发布工作台。

## 当前状态

项目正在按里程碑开发。现阶段已建立 Electron、Vue 3、TypeScript 与
FastAPI 双进程骨架、共享契约、基础页面框架及自动测试。

## 开发环境

- Node.js 24
- Python 3.11 稳定版

```powershell
npm install
python -m pip install -r backend\requirements-dev.txt
$env:PYTHONPATH = "backend"
npm test
python -m pytest backend\tests -q
npm run dev
```

Python 服务只能由 Electron 使用随机会话令牌启动；直接运行时必须设置
`AUTOCUT_SESSION_TOKEN` 与 `AUTOCUT_PORT`。
