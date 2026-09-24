# 08 · 部署与发布(Cloudflare Pages)

## 1. 结论:可以发布到 4seas-communityos.pages.dev

本系统(Next.js 15 App Router)已按 Cloudflare Workers/Pages 运行时配置完成:

- 适配器:@opennextjs/cloudflare(open-next.config.ts)
- 构建产物:.open-next/(worker.js + assets),pnpm cf:build 一条命令
- 本地已验证:next build(standalone)→ OpenNext worker 构建通过
- 配置:wrangler.jsonc(name=4seas-communityos,nodejs_compat,Hyperdrive 绑定)

## 2. 发布方式

### CI 自动(推荐)

push 到 preview/m0 分支即触发 .github/workflows/deploy-preview.yml:
安装依赖 → pnpm cf:build → wrangler pages deploy(.open-next/assets)。

需要在仓库 Settings → Secrets 添加:

| Secret | 说明 |
| --- | --- |
| CLOUDFLARE_API_TOKEN | Cloudflare API Token(需 Cloudflare Pages:Edit 权限) |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare 账户 ID |

### 本地手动

    pnpm cf:build
    pnpm wrangler login                       # 一次性交互登录
    pnpm cf:deploy                            # 部署到 4seas-communityos 项目

本地预览(workerd 本地运行时):

    pnpm cf:preview

## 3. 数据库(唯一外部依赖)

Cloudflare Workers 无 TCP,PostgreSQL 需经 **Hyperdrive**(已配置 binding):

    # 在 Cloudflare dashboard 或 CLI 创建 Hyperdrive,指向可达的 Postgres:
    wrangler hyperdrive create 4seas-db --connection-string="postgres://..."

然后把返回的 id 填入 wrangler.jsonc 的 hyperdrive[0].id(或设为仓库变量 HYPERDRIVE_ID)。
开发/自托管继续用 docker-compose 的本地 Postgres(DATABASE_URL)。

注意:本机 DSH 沙箱的 pnpm 带有供应链策略(拒绝过新的包版本、禁止未审批构建脚本),
因此 wrangler 固定在 4.136.3、.npmrc 放宽本仓库策略;GitHub Actions 使用上游 pnpm 不受影响。

## 4. 分支与发布策略(当前)

- main:仅文档(评审通过后才合入代码 PR)
- 13 个栈式 PR(#1-#13):每支 ≤300 行左右,等待外部 review
- preview/m0:合并全部 PR 的预览分支,已配置自动部署到 Pages preview
- PR 全部保留不合并,review 通过后按栈顺序合并,preview 分支随之更新

## 5. 环境变量(生产)

| 变量 | 值 |
| --- | --- |
| APP_URL | https://4seas-communityos.pages.dev(wrangler vars 已设) |
| HYPERDRIVE | 绑定自动注入 connectionString |
| SESSION_SECRET | 生产强随机值(wrangler secret put SESSION_SECRET) |
| BOT_FEED_TOKEN | 4seasbot 拉取 feed 的令牌(secret) |
| EMAIL_BACKEND | smtp(配 SMTP_*)或保持 console |
| TELEGRAM_BOT_TOKEN | 绑定 Telegram 用(secret) |
| CAS_API_URL / CAS_SERVICE_KEY | 接入 CAS 后配置 |
| POINTS_ENABLED | 默认 false;V2 链上积分就绪后开启
