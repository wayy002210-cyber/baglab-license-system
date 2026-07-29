# 全自动混剪工作台

Windows 11 本地单机视频混剪与发布工具。使用 Electron/Vue 管理素材、Persona、镜头模板、任务与排期，Python 服务负责百炼文案、MiniMax 配音、素材选择、FFmpeg 合成以及 Playwright 发布。

## 开发验证

```powershell
npm install
python -m pip install -r backend/requirements-dev.txt
python -m playwright install chromium
npm run check
npm run dev
```

## Windows 打包

```powershell
npm run prepare:runtime
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist:win
```

安装包输出到 `release/AutoCut-Studio-0.1.0-x64.exe`。安装包自带 Python 后端、FFmpeg、ffprobe 与 Chromium。

详细信息见：

- [开发说明](docs/开发说明.md)
- [架构说明](docs/架构说明.md)
- [用户操作手册](docs/用户操作手册.md)
- [故障排查手册](docs/故障排查手册.md)
