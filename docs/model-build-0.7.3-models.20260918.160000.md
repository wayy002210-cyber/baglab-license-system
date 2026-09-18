# 百炼模型选择版交付记录

- Build ID：`0.7.3-models.20260918.160000`
- 分支：`feature/license-system`
- 打包源码 commit：`ba088ac6e347e3f5e500d0b2752eceaa9498aef4`
- 授权服务：`https://license-api.pangluobo.site`

## 本次范围

- 选题与文案的既有全局去重保持默认启用，不增加关闭选项。
- 百炼文案模型改为手动刷新、选择并保存；打开设置页不会自动访问百炼。
- 每次刷新只返回最多 5 个经过当前密钥实际调用验证的推荐模型。
- 旧配置 `deepseek-v3` 自动迁移为 `deepseek-v4.1-flash`。
- MiniMax、音频模型、混剪、发布和平台适配逻辑未修改。

## SHA-256

| 交付物 | 大小（字节） | SHA-256 |
|---|---:|---|
| `release/袋研官矩阵混剪工作台-0.7.3-models.20260918.160000-x64.exe` | 354181227 | `265400393DC5429EDE9CDB961BAF789C11817159B37DB5D9A55F769E8D30E145` |
| `release/win-unpacked/resources/app.asar` | 84523182 | `DA2597C89B62915BB031DDBFB862B1A94A0CA58139D06DF7297268545B131FA4` |
| `release/win-unpacked/resources/backend/autocut-backend-0.7.3-models.20260918.160000.exe` | 51662664 | `53CBAA82ED4A97A6D30ADE2B0E566FC95CA814B8A6E76259E94E34C3B34DED89` |

## 验证结果

- TypeScript 类型检查通过。
- Electron/Vue：230 项通过，1 项按设计跳过。
- Python/FastAPI：197 项通过。
- Electron/Vue 生产构建、PyInstaller 后端构建、Electron 原生模块验证和 NSIS 安装包构建通过。
- 打包后的 Python 后端健康检查通过，Build ID 与桌面端一致。
- 模型设置、授权请求头、模型刷新服务、设置页交互和旧安装包保护共 20 项定向回归测试通过。
- 原 `0.7.2-license.20260814.170533` 安装包继续保留，SHA-256 仍为 `CA01F751ECFADCB3C86BD04CD17BF4492F4CF9A983A9D89EBE7F5326094BFCC3`。

## 使用说明

安装新版本后进入“设置 → AI 服务密钥”，保存有效百炼 API Key，再点击“查看模型更新”。软件只在点击时检查当前可用模型；选择推荐模型后需点击保存。
