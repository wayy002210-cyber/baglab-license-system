# 授权网络修复版交付记录

- Build ID：`0.7.1-license.20260814.92600`
- 修复内容：授权 API 改用 Electron 网络栈，继承 Windows 系统代理，解决 Node 全局 `fetch` 直连 Vercel 默认域名超时的问题。
- 原 `0.7.0-license.20260813.162600` 安装包已保留在 `output/license-builds/0.7.0-license.20260813.162600/`。

## SHA-256

| 交付物 | 大小（字节） | SHA-256 |
|---|---:|---|
| `release/袋研官矩阵混剪工作台-0.7.1-license.20260814.92600-x64.exe` | 353140116 | `02E1CE09D2D7A31538E44AED679174B0B667FD53792C1C1D034CA0DB3A177671` |
| `release/win-unpacked/resources/app.asar` | 84490265 | `1D9DB4E88C673DB89F446B2F004CD25AA8038A025877C40F5B2B6ACC2E88E663` |
| `release/win-unpacked/resources/backend/autocut-backend-0.7.1-license.20260814.92600.exe` | 50572474 | `C5892E0ADAE33181D83D6A055282D2AA02E3422150C7E7136CC04E9CC290D26C` |

## 验证

- 授权网络回归测试完成先失败、后通过的验证过程。
- Electron `net.fetch` 在本机真实访问生产授权后台返回 HTTP 200。
- Electron/Vue：198 项通过，1 项跳过。
- Python/FastAPI：154 项通过。
- 类型检查、前端生产构建、PyInstaller 与 NSIS 安装包构建通过。
