# 自定义授权域名版交付记录

- Build ID：`0.7.2-license.20260814.170533`
- 授权服务：`https://license-api.pangluobo.site`
- DNS：腾讯云 DNSPod CNAME 到 Vercel
- HTTPS：Vercel 托管证书，自动续期
- 原 `0.7.1-license.20260814.92600` 安装包已归档到 `output/license-builds/0.7.1-license.20260814.92600/`。

## SHA-256

| 交付物 | 大小（字节） | SHA-256 |
|---|---:|---|
| `release/袋研官矩阵混剪工作台-0.7.2-license.20260814.170533-x64.exe` | 353140838 | `CA01F751ECFADCB3C86BD04CD17BF4492F4CF9A983A9D89EBE7F5326094BFCC3` |
| `release/win-unpacked/resources/app.asar` | 84490266 | `8043F98CC2BD14DC330492AAB878F399215B0878FCECDFE83C097E354D106FBD` |
| `release/win-unpacked/resources/backend/autocut-backend-0.7.2-license.20260814.170533.exe` | 50573087 | `EDB13D1C794A3B96DB7420C7EFF5A07486D0347D566493501D565132071AC03D` |

## 验证结果

- Vercel 域名状态：configured-correctly。
- DNS CNAME：`license-api` → `000a34eadc5218e9.vercel-dns-017.com`。
- HTTPS证书已签发并启用自动续期。
- 使用自定义域名和本 Build ID 完成生产 API 全流程：管理员登录、生成一次性码、首次激活、在线校验、重复兑换拒绝、跨设备拒绝、禁用、恢复、延期、解绑和重新绑定全部通过。
- Electron/Vue：201 项通过，1 项跳过。
- Python/FastAPI：154 项通过。
- TypeScript、Electron/Vue、PyInstaller 和 NSIS 构建通过。
