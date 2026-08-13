# 授权系统部署与运维

## 首次部署

1. 在 Neon 建立 PostgreSQL 项目，复制仅服务端使用的 `DATABASE_URL`。
2. 在 `license-service` 目录设置临时 `ADMIN_INITIAL_PASSWORD`，运行 `npm run secrets:generate`。输出仅填写到 Vercel 环境变量，不保存到 Git、聊天记录或安装包。
3. 使用 `DATABASE_URL` 运行 `npm run db:migrate`。
4. 将 `.env.example` 中各变量填写到 Vercel；部署根目录选择 `license-service`。
5. 用 Vercel 默认 HTTPS 域名和生成结果中的公钥运行桌面根目录 `npm run license:public-config`，再构建安装包。

## 密钥保存

签名私钥、卡密 Pepper、管理员密码哈希和会话秘密只保存在 Vercel 加密环境变量与离线密码管理器中。桌面安装包只包含 Vercel HTTPS 地址和 Ed25519 公钥。轮换签名密钥会使旧离线凭证失效，应安排客户端升级窗口。

## 数据库备份与恢复

优先使用 Neon 控制台的分支、时间点恢复和快照功能。额外离线备份可使用 `pg_dump --format=custom --no-owner DATABASE_URL > license.backup`；恢复到新空库使用 `pg_restore --no-owner --clean --if-exists --dbname NEW_DATABASE_URL license.backup`。恢复演练必须使用独立数据库，确认记录数、管理员登录、激活校验后再切换 Vercel 的连接串。

## 升级与正式域名

升级 Vercel Pro 或 Neon 付费计划不会改变数据库结构。绑定正式域名后，先在 Vercel 验证 DNS 和 HTTPS，再用新域名重新生成桌面公开配置并发布新 Build ID；旧域名至少保留一个客户端升级周期。提高 `MINIMUM_DESKTOP_BUILD_ID` 可远程拒绝旧版本。

桌面软件无法做到绝对不可破解；本方案的目标是让最终授权状态由服务器控制，提高绕过成本，阻止卡密共享，并提供远程撤销能力。
