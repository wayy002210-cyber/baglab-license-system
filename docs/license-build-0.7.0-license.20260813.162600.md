# 授权版 Windows 测试包交付记录

- Build ID：`0.7.0-license.20260813.162600`
- 基线：`4c966845c2f733d43287089628fe084e3e1b445a`
- 基线标签：`baseline-0.6.8-batchfix.20260812.220000`
- 开发分支：`feature/license-system`
- 授权服务：`https://baglab-license-system.vercel.app`
- 构建时间：2026-08-13（Asia/Shanghai）

## SHA-256

| 交付物 | 大小（字节） | SHA-256 |
|---|---:|---|
| `release/袋研官矩阵混剪工作台-0.7.0-license.20260813.162600-x64.exe` | 353140766 | `78C458FB4FEAA58AD5F0C411988208258980414B20DBE35A9FF7CD6F7FBAA495` |
| `release/win-unpacked/resources/app.asar` | 84490069 | `6C89D13513855F88291A32580D14A5AC0A59D8B8D72B4BC7C9819190F7BDCA1C` |
| `release/win-unpacked/resources/backend/autocut-backend-0.7.0-license.20260813.162600.exe` | 50572550 | `32CFB82ACA83486334FFCB3E592A50ED7BE5EB3888DE2EC8A5B5644A4D1040F2` |

安装包只内置 Vercel HTTPS 地址和 Ed25519 公钥。签名私钥、数据库连接串、激活码 Pepper、管理员密码与会话秘密均不进入 Git 或安装包。

原 `0.6.8-batchfix.20260812.220000` 成果及其校验记录保持不变，见 `docs/baseline-0.6.8-batchfix-artifacts.md`。

## 自动验证

- Electron/Vue：197 项通过，1 项跳过。
- Python/FastAPI：154 项通过。
- 授权服务：26 项通过。
- 桌面端与授权服务 TypeScript 类型检查通过。
- Electron/Vue 构建、Next.js 生产构建、PyInstaller 后端构建和 NSIS 安装包构建通过。
- 安装包内公钥配置、`app.asar`、后端 EXE 与原生依赖检查通过。
- Git 跟踪文件秘密扫描未发现真实凭证；`.tmp`、环境变量、日志、数据库与构建产物均未纳入 Git。
- 2026-08-13 20:34（Asia/Shanghai）对生产环境完成真实 API 冒烟测试：管理员登录、生成一次性测试码、首次激活、在线校验、重复兑换拒绝、跨设备拒绝、禁用生效、恢复、延期、解绑及换机重新绑定全部通过。测试授权及操作保留在 `license_events` 中供审计，明文测试码未写入 Git。

真实 Windows 设备上的安装、激活、断网、到期与换机仍按人工验收清单执行；测试不得删除客户项目、素材或发布数据。
