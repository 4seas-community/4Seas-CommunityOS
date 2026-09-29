# 08 · 部署与发布(Cloudflare Pages + D1)

## 1. 结论:线上运行中

- **站点**:https://4seas-communityos.pages.dev
- **Pages 项目**:4seas-communityos(production branch = main)
- **运行时**:Next.js 15 App Router → @opennextjs/cloudflare(open-next.config.ts)
- **数据库**:Cloudflare D1(SQLite),Pages 项目绑定 `DB`
- **健康检查**:`GET /v1/healthz` 返回数据库驱动与连通性,例如
  `{"ok":true,"mode":"production","database":"d1 (reachable)","problems":[]}`

## 2. 数据库:Cloudflare D1(SQLite)

Postgres/Neon 已退役,原因见 docs/10 §5(共享 Neon 项目配额被耗尽,连带影响 Listmonk)。
现在:**同一份 SQLite schema**,生产跑 D1,本地开发与测试跑 Node 内置的 node:sqlite。
本地不再需要数据库服务(没有 docker-compose,也没有连接串)。

### 2.1 绑定

`wrangler.jsonc` 里声明 binding(`DB`)与迁移目录:

    "d1_databases": [
      { "binding": "DB", "database_name": "4seas-communityos",
        "database_id": "12ec9cbb-8949-476a-b8a4-efd740e1e19f", "migrations_dir": "drizzle" }
    ]

**注意**:`wrangler pages deploy` **不会**把 wrangler.jsonc 里的绑定推送到 Pages;
Pages 的绑定必须配置在项目上(production / preview 环境)。已用 API 配置:

    PATCH /accounts/{account_id}/pages/projects/4seas-communityos
    {"deployment_configs":{"production":{"d1_databases":{"DB":{"id":"12ec9cbb-8949-476a-b8a4-efd740e1e19f"}}}}}

（PATCH 只发送 d1_databases,已有的 env_vars/secrets 不会被覆盖。换绑定或加 preview 环境时照做。）

### 2.2 迁移

    # 生产(D1):按文件名记录在 d1_migrations,可重复执行
    wrangler d1 migrations apply 4seas-communityos --remote

    # 本地(文件库 .data/communityos.db):由 node:sqlite 应用同一批 SQL
    pnpm db:migrate

迁移文件在 `drizzle/`;Postgres 时代的历史迁移保留在 `drizzle-postgres/`(仅供参考)。
`drizzle/0000_clumsy_malice.sql` 末尾有一段**手写**的触发器(见 2.4),drizzle-kit 无法表达,
因此它固定放在初始迁移里;之后的 schema 变更从 `0001+` 继续生成。

> 若 `wrangler d1` 报 `Authentication error [code: 10000]`,说明当前 API Token 没有 D1 权限。
> wrangler 会自动加载项目根 `.env`(里面的 token 只有 Pages 权限),可以二选一:
> 给 token 加 `D1:Edit`;或在**没有 `.env` 的目录**下用 `wrangler login` 的 OAuth 身份执行 D1 运维。

### 2.3 本地开发与测试

    pnpm db:migrate   # 建表(默认 .data/communityos.db,DATABASE_FILE 可覆盖)
    pnpm seed        # 4Seas 样例:2 栋建筑 / 2 层 / 3 个场地 / 1 个活动 / demo 管理员
    pnpm test        # 内存 SQLite,无需任何数据库服务,约 4 秒跑完 62 个测试

驱动选择在 `src/lib/db/index.ts`:有 D1 binding 就用 D1,否则用 node:sqlite
(经 drizzle 的 `sqlite-proxy`,零新增依赖)。`db` 是惰性代理,构建期不会触碰绑定。

### 2.4 双重预订保护(触发器)

Postgres 用 `EXCLUDE USING gist`(`tstzrange` + `btree_gist`)保证同一场地档期不重叠;
SQLite 没有排他约束,改为 `bookings` 上的 **BEFORE INSERT/UPDATE 触发器**,
命中重叠时 `RAISE(ABORT, 'booking_overlap')`。业务层(`src/modules/booking/service.ts`)
把该错误映射为 409;`src/lib/db/errors.ts` 同时识别 unique 违反。
枚举值与不变量(status/时间顺序/非负积分)由 `CHECK` 约束兜底(mirror 原 PG enum)。

### 2.5 线上数据

线上已灌入 seed 样例数据。需要在新库重新灌数据时:

    # 1) 本地生成已迁移 + 已 seed 的 SQLite 文件
    DATABASE_FILE=/tmp/seed.db pnpm db:migrate && DATABASE_FILE=/tmp/seed.db pnpm seed
    # 2) 导出 INSERT 语句并执行到线上(见 docs/10 §5 的一次性脚本思路)
    wrangler d1 execute 4seas-communityos --remote --file=/tmp/seed.sql

## 3. 构建与发布

    pnpm cf:build     # next build + opennextjs-cloudflare build --skipNextBuild
    pnpm cf:stage     # 生成 .deploy/(_worker.js、assets、_routes.json)
    pnpm cf:deploy    # wrangler pages deploy .deploy --project-name=4seas-communityos --branch=main

- `_routes.json` 把 `/_next/static` 与图片排除出 Worker,由 Pages 直接服务(否则静态资源 404)。
- **必须**整包上传(worker + `server-functions/` + assets):只传 assets 会得到白屏。
- 产物约 2700 文件 / 56MB(Next standalone 追踪副本),是 Next.js on Workers 的正常形态。

## 4. 上线后验证清单

    curl -s https://4seas-communityos.pages.dev/v1/healthz            # ok:true, database: d1 (reachable)
    curl -s https://4seas-communityos.pages.dev/api/venues | head -c 200
    curl -s -o /dev/null -w '%{http_code}\n' https://4seas-communityos.pages.dev/admin

写路径冒烟:`POST /api/auth/register` 应返回 201 与 memberId(会在 D1 落一行 members)。

## 5. 当前线上环境(2026-09-29 实录)

- **URL**:https://4seas-communityos.pages.dev(全部页面/API 200)
- **数据库**:Cloudflare D1 `4seas-communityos`(`12ec9cbb-8949-476a-b8a4-efd740e1e19f`,APAC/SIN)
- **绑定**:Pages production `d1_databases.DB`;compatibility_flags = nodejs_compat
- **Pages secrets**:`SESSION_SECRET`、`BOT_FEED_TOKEN`、`RESEND_API_KEY`(`DATABASE_URL` 是 Neon 时代遗留,已不被读取)
- **Pages vars**:`EMAIL_BACKEND=resend`、`EMAIL_FROM=iDoris AI <hello@idoris.ai>`、`EMAIL_REPLY_TO=hello@idoris.ai`
- **凭据**:`CLOUDFLARE_API_TOKEN`(Pages)、`CF_ACCOUNT_ID` 来自 ~/Dev/.env 与 ~/Dev/mycelium/blog/.env,勿入库
- **管理员**:`demo@4seas.example`(seed)与 `jhfnetboy@gmail.com`(bootstrap);
  线上提升管理员用 `wrangler d1 execute ... --command="UPDATE members SET roles=... WHERE email=..."`

## 6. 邮件(事务邮件直发)

    EMAIL_BACKEND=resend
    RESEND_API_KEY=re_...        # idoris.ai 的 send-only key,只存在本机 .env 与 Pages secret
    EMAIL_FROM=iDoris AI <hello@idoris.ai>
    EMAIL_REPLY_TO=hello@idoris.ai

- 实现:`src/lib/email.ts`(`sendViaResend`);品牌外壳与 PowerSalesMan 的
  `shared/email-shell.ts` 同源(palette / iDoris 字标 / Doris 头像)。
- 自测:`pnpm test tests/email.test.ts` —— 注入 fake fetch,钉住 payload(from/to/reply_to/
  text + html)与 rejected/unknown/not-configured 三个分支;本地默认走 console,不发真信。
- 线上自测:注册一个邮箱,应收到 `hello@idoris.ai` 发出的验证信;链接可直接完成验证。

## 7. M2 已交付

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Luma 单向发布 | ✅ 代码+测试 | mapper/client/sync;真实对接需 Luma Plus(LUMA_API_KEY + LUMA_ENABLED) |
| Social Layer 单向发布 | ✅ 代码+测试 | sola.day API(SDK 字段);需服务账号 JWT(SOCIAL_LAYER_TOKEN) |
| 同步 outbox 处理器 | ✅ | `POST /v1/integrations/sync/run`(service token),供 cron 触发 |
| Agent API | ✅ 线上验证 | `/v1/agent/*` 读开放、写 draft+confirm(1h 过期、单次确认、幂等取消) |
| MCP server | ✅ | `mcp/server.mjs`,零依赖 stdio,9 个工具代理 Agent API |
| D1 迁移 | ✅ 线上验证 | schema 双驱动、触发器替代排他约束、数据迁移、健康检查 |

运维命令:

    # 生成 Agent key(密钥只显示一次)
    pnpm tsx scripts/agent-key.ts "claude-desktop" "venues:read,events:read,events:write,bookings:write"

    # MCP(本地 stdio)
    COS_API_URL=https://4seas-communityos.pages.dev COS_AGENT_KEY=cos_ak_... node mcp/server.mjs