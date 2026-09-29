# 11 · 交接说明(Handoff)

> 快照:2026-09-29,main = `ce200cf`,线上 https://4seas-communityos.pages.dev
> 本文档假设读者**没有**此前任何会话上下文,读完即可接手继续开发。

## 0. 一分钟速览

- **系统**:4Seas CommunityOS —— 社区「场地 / 活动 / 成员」管理系统。
- **技术栈**:Next.js 15 App Router(TypeScript strict, Tailwind v4)→ @opennextjs/cloudflare →
  Cloudflare Pages Worker;数据库 **Cloudflare D1(SQLite)**;事务邮件经 **Resend**,
  发件地址 `hello@idoris.ai`(显示名 `4Seas Community`)。
- **线上**:https://4seas-communityos.pages.dev(生产分支 `main`,已部署可用)。
- **测试**:`pnpm test` → **85 passed**(内存 SQLite,不需要任何数据库服务或网络)。
- **已完成**:M0/M1/M2 全部功能、Admin 控制台第一批、数据库迁移 D1、事务邮件、一键登录、Admin 第二批 2.1/2.2。
- **下一个 AI 的主要任务**:**docs/10 §3 第二批的 2.3–2.6**(通知记录 / Agent key 管理 / 数据导出 / 审计日志),
  逐项规格见本文档第 6 节。

## 1. 仓库与分支

- 仓库:`git@github.com:4seas-community/4Seas-CommunityOS.git`
- 分支:`main`(线上)、`preview/m0`(旧预览,可忽略)。**已合并的特性分支都已删除**。
- 工作方式:小 PR(≤300 行,文档不限)+ 合并前自审。近期 PR #19–#26 全部是自审后合并的。

## 2. 架构与数据流

```
浏览器 ──> Cloudflare Pages(Worker,OpenNext)
   ├─ 服务端组件 src/app/**            用 apiGet/apiSend 走同源 HTTP 调自家 API
   ├─ 自定义路由  src/lib/http.ts(Router:鉴权/审计中间件)
   │    └─ 挂载于 src/app/api/[[...path]]/route.ts 与 src/app/v1/[[...path]]/route.ts
   ├─ src/modules/*(service 层:业务规则 + 鉴权;routes 层:I/O)
   └─ src/lib/db(D1 绑定 `DB`;本地是 node:sqlite)
外部:Luma / Social Layer(单向发布)、4seasbot(拉取式 outbox)、Resend(发信)、CAS(扩展层,mock/HTTP)
```

领域模型见 docs/03;集成见 docs/04;数据库与部署见 docs/08。

## 3. 环境与凭据(重要)

### 3.1 本地 `.env`(已 gitignore,**不要提交**)

项目根 `.env` 里有:`DATABASE_FILE`(本地 SQLite 路径,默认 `.data/communityos.db`)、`APP_URL`、
`SESSION_SECRET`、`BOT_FEED_TOKEN`、`EMAIL_BACKEND=resend`、`RESEND_API_KEY`、`EMAIL_FROM`、
`EMAIL_REPLY_TO`、`EMAIL_BRAND_NAME`、`EMAIL_PROVIDER_NAME`、`LUMA_*`、`SOCIAL_LAYER_*`、
`CAS_*`、`POINTS_ENABLED`、`TELEGRAM_BOT_TOKEN`。完整清单见 `.env.example`。

### 3.2 凭据来源(不在仓库里)

| 用途 | 位置 | 备注 |
| --- | --- | --- |
| Resend 发信 key(idoris.ai, send-only) | `~/Dev/.env` 的 `RESEND_API_KEY_IDORIS_ONLY_SEND` | **只能发信**,读不了域名列表;验证方式就是真发一封 |
| Cloudflare API Token(Pages 权限) | `~/Dev/mycelium/blog/.env` 的 `CLOUDFLARE_API_TOKEN` | **没有 D1 权限**,只能做 Pages |
| Cloudflare Account ID | `~/Dev/.env` 的 `CF_ACCOUNT_ID` | `7bf23342f21baa5ebfc7bc7b74f5a1f2` |
| D1 运维身份 | `wrangler login` 的 OAuth(`~/Library/Preferences/.wrangler/config/default.toml`) | 见 7.1 |

### 3.3 Cloudflare 线上配置(Pages 项目 `4seas-communityos`)

- **绑定**:`d1_databases.DB` → database_id `12ec9cbb-8949-476a-b8a4-efd740e1e19f`
- **兼容标志**:`nodejs_compat`;构建输出目录不适用(用 `wrangler pages deploy` 手动部署)
- **环境变量(plain_text)**:`APP_URL`、`EMAIL_BACKEND=resend`、
  `EMAIL_FROM=4Seas Community <hello@idoris.ai>`、`EMAIL_REPLY_TO=hello@idoris.ai`
- **Secrets**:`SESSION_SECRET`、`BOT_FEED_TOKEN`、`RESEND_API_KEY`
- **绑定/变量都不走 wrangler.jsonc**:`wrangler pages deploy` 不会推送 wrangler.jsonc 里的绑定,
  必须用 API PATCH(见 7.2)。

### 3.4 线上账号与数据

- 管理员(community admin):`jhfnetboy@gmail.com`、`demo@4seas.example`(种子)。
- D1 当前数据:1 community / 2 buildings / 3 venues / 3 venue_rules / 1 event / 2 members。
- 登录方式:邮箱一次性链接(见第 5 节「一键登录」)。管理员权限由 `members.roles` 里的
  `{"scope":"community:*","role":"admin"}` 决定。

## 4. 日常命令(都验证过)

```bash
pnpm install                 # pnpm v11;项目内需要 onlyBuiltDependencies(esbuild/workerd)
pnpm db:migrate              # 把 drizzle/*.sql 应用到本地 .data/communityos.db(node:sqlite)
pnpm seed                    # 4Seas 样例数据 + demo 管理员
pnpm test                    # 85 passed,内存 SQLite
node ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # 类型检查(直接用 tsc 可能被沙箱策略挡)
pnpm dev                     # 本地 Next(会走 .env 的真实 Resend,注意会真发信)

# 生产迁移(D1)
wrangler d1 migrations apply 4seas-communityos --remote

# 构建与部署(main)
pnpm cf:build && pnpm cf:stage && pnpm cf:deploy
```

## 5. 已完成范围(以 PR 为索引)

| PR | 内容 |
| --- | --- |
| #12–#18 | 初版迁移/种子、场地与规则、活动生命周期、预订引擎、通知 outbox、Luma、Social Layer、Agent API + MCP、外部评审安全修复 |
| #19 | Admin 控制台第一批:建筑/楼层 API、`/admin`、成员与角色、积分调整、`make-admin` 兜底 |
| #20 | **数据库迁移到 Cloudflare D1**:schema 转 SQLite、CHECK 约束、重叠触发器替代排他约束、`db.batch` 原子写 |
| #21 | API 错误契约:鉴权/校验失败返回 401/400 而不是 500 |
| #22 | **事务邮件经 Resend**,发件地址 `hello@idoris.ai`,rejected/unknown 语义 |
| #23 | Admin 第二批 2.1/2.2:预订审批 + 14 天占用网格、活动审核队列 |
| #24 | **一键登录修复**:会话 cookie 必须由浏览器接收(服务端 fetch 会丢掉 Set-Cookie) |
| #25 | 登录失败不再静默:cookie 未保留 / 链接失效 / 邮箱格式错 都有明确文案 |
| #26 | 邮件品牌改为 **4Seas Community**(4Seas logo 抬头,iDoris 仅页脚一行),并堵掉浏览器看到裸 JSON |
| #27 | Admin 2.3: 通知发送记录与失败重试界面 (`/admin/notifications`),PII 访问控制 |
| #28 | Admin 2.4: Agent Key 管理界面 (`/admin/agent-keys`),一次性回显、吊销即刻生效 |
| #29 | Admin 2.5: 数据导出 (CSV/JSON) 引擎与页面 (`/admin/export`),RFC 4180、BOM、CRLF |
| #30 | Admin 2.6: 审计日志查询 API 与界面 (`/admin/audit`),复合游标分页、操作者信息补全 |

### 一键登录(容易踩坑,务必理解)

1. `POST /api/auth/login/request` 生成一次性 token(15 分钟),邮件里是
   `/login/verify?token=...`。
2. 该页面渲染一个普通表单(**隐藏 token**)+ `src/components/auto-submit.tsx` 自动提交。
   - **为什么不用 GET 直接消费 token**:邮件扫描器会预抓取链接,GET 消费会让用户点开就失效。
   - **为什么必须浏览器提交**:`Set-Cookie` 挂在 API 响应上,服务端 fetch 拿不到 → 这正是
     #24 修掉的 bug(当时 token 被消费、cookie 丢掉,用户回到登录表单还被要求输入邮箱)。
3. 表单 POST → 303 + `Set-Cookie` → `/me?login=ok`;失败 → `/me?login=failed`。
4. 判据:`isBrowserNavigation()`(`src/modules/auth/routes.ts`)= 表单编码 **或** `Accept: text/html`。
   浏览器请求永远得到 303 页面,API 客户端(要 JSON)保持 JSON。

## 6. 待办:第二批 2.3 – 2.6(下一阶段主要工作)

> 依据 docs/10 §3。建议一项一个 PR,沿用现有分层:service 做鉴权与规则,routes 只做 I/O,
> 页面用 `canUseAdmin`/`getCurrentMember` 门控,`apiGet` 读、客户端组件 `useAction` 写。
> 全部完成后按 docs/10 §4 的要求做一次对照 docs/02 §3 与 docs/05 的全量复查。

### 2.3 通知发送记录界面 ✅ (已完成)

- **现状**:表 `notification_outbox`;service `src/modules/notify/service.ts`(`enqueue` 等);
  机器人拉取接口 `GET /v1/integrations/bot/notifications`(service token)。
- **要做**:`GET /api/admin/notifications?status=&template=&since=&limit=`(admin 门控,返回 outbox 行 +
  收件人标识)+ 页面 `/admin/notifications`(时间 / 模板 / 渠道 / 目标 / 状态 / 重试次数 / last_error),
  支持按状态过滤;可选 `POST /api/admin/notifications/:id/retry`(把 failed 重置为 pending 并清 last_error)。
- **验收**:线上能列出真实发送记录(可先触发一次注册/登录产生邮件);页面与机器人 feed 数据一致;
  非 admin 访问 403/401。
- **注意**:outbox 里有 `target`(可能是 chat_id/邮箱),属于 PII,**只能 admin 可见**(参考 #18 的教训)。

### 2.4 Agent key 管理界面 ✅ (已完成)

- **现状**:表 `agent_keys`(只存 SHA-256,scopes 为 JSON 数组,支持 `revokedAt`);
  命令行 `scripts/agent-key.ts`;鉴权在 `src/modules/agent/service.ts`。
- **要做**:`GET /api/admin/agent-keys`(不含 hash)、`POST /api/admin/agent-keys`(创建并**一次性**返回明文)、
  `DELETE /api/admin/agent-keys/:id`(吊销 = 写 revokedAt,不物理删除)+ 页面 `/admin/agent-keys`
  (创建/吊销/查看 lastUsedAt)。
- **验收**:创建的 key 能通过 `/v1/agent/*` 调通(用 `mcp/server.mjs` 或 curl);吊销后立即 401;
  明文只在创建响应里出现一次。
- **注意**:scope 词表在 `agent/service.ts`;不要回显 keyHash;每次操作写审计。

### 2.5 数据导出(CSV / JSON) ✅ (已完成)

- **现状**:service 层已有 `listEvents`(支持 `status` 过滤)、`listBookings`、`listMembers`、场地查询。
- **要做**:`GET /api/admin/export?type=events|bookings|venues|members&format=csv|json`(admin 门控),
  以及 `/admin` 上的导出入口。
- **验收**:导出内容与页面一致;CSV 行尾用 CRLF、字段含逗号/引号/换行时正确转义(建议加 UTF-8 BOM 便于 Excel);
  时间统一 ISO 8601;大数据量下考虑流式或分页上限。
- **注意**:导出的可见范围必须与 API 权限一致(建议仅 community admin 可导出全量)。

### 2.6 审计日志查询 + 界面 ✅ (已完成)

- **现状**:表 `audit_logs`;`src/lib/audit.ts` 的 `writeAudit`;
  `src/lib/http.ts` 的路由中间件已自动记录**所有成功写操作**(actorType/actorId/action/entity/draftId/ip/ua)。
- **要做**:`GET /api/admin/audit?actor=&action=&entityType=&entityId=&from=&to=&limit=&cursor=`
  (admin 门控,倒序分页)+ 页面 `/admin/audit`(过滤 + 详情展开 before/after JSON)。
- **验收**:管理台做一次写操作后能在审计页看到;按实体/操作者/时间过滤生效;分页稳定(建议按
  `created_at, id` 组合游标)。
- **注意**:含 ip/ua 与 before/after(可能含 PII),仅 admin;不要暴露给 venue_manager。

## 7. 陷阱与约定(踩过的坑,按重要性排序)

### 7.1 D1 运维要用 OAuth,不能用项目 .env 里的 token

`wrangler` 会自动加载项目根的 `.env`,而里面的 `CLOUDFLARE_API_TOKEN` **没有 D1 权限**,
会报 `Authentication error [code: 10000]`。做法:在**不含 `.env` 的目录**下执行,并使用
`wrangler login` 的 OAuth 身份:

```bash
mkdir -p /tmp/wr-d1 && cd /tmp/wr-d1
cat > wrangler.jsonc <<'EOF'
{ "name": "4seas-communityos-d1ops",
  "d1_databases": [{ "binding": "DB", "database_name": "4seas-communityos",
    "database_id": "12ec9cbb-8949-476a-b8a4-efd740e1e19f",
    "migrations_dir": "/绝对路径/4Seas-CommunityOS/drizzle" }] }
EOF
export CLOUDFLARE_ACCOUNT_ID=7bf23342f21baa5ebfc7bc7b74f5a1f2
/绝对路径/4Seas-CommunityOS/node_modules/.bin/wrangler d1 migrations apply 4seas-communityos --remote
/绝对路径/4Seas-CommunityOS/node_modules/.bin/wrangler d1 execute 4seas-communityos --remote --command="select 1"
```

### 7.2 Pages 的绑定与变量

绑定与 env vars 挂在**项目**上,不是 wrangler.jsonc。用 PATCH(只发要改的键,PATCH 会保留其它键):

```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects/4seas-communityos" \
  -H "Authorization: Bearer $PAGES_TOKEN" -H 'Content-Type: application/json' \
  -d '{"deployment_configs":{"production":{"env_vars":{"EMAIL_FROM":{"type":"plain_text","value":"..."}}}}}'
```

改动 env vars / secrets 后需要**重新部署**才生效。secrets 用 `wrangler pages secret put NAME --project-name=4seas-communityos`。

### 7.3 数据库方言(SQLite/D1),别写 Postgres 习惯

- 列类型辅助在 `src/lib/db/sqlite.ts`:时间 = `integer(timestamp_ms)`(仍是 JS Date)、
  JSON/数组 = `text(json)`、布尔 = `integer(boolean)`。
- **没有 `jsonb` 运算符**:用 `json_extract(col, '$.key')`(见 `tests/event-flow.test.ts`)。
- **没有交互式事务**:需要原子时用 `getDb().batch([...])`(见 `createEvent`);
  `db.transaction()` 在 D1 上不可靠。
- **枚举没有类型**:取值在 schema 的 `*Values` 常量 + `CHECK` 约束 + Zod 三处,**加值要同时改**。
- **档期不重叠**由 `drizzle/0000_clumsy_malice.sql` 末尾的 **触发器**保证(`RAISE(ABORT,'booking_overlap')`),
  错误映射在 `src/lib/db/errors.ts`。改动 bookings 写入逻辑时别绕过它。

### 7.4 测试环境

`tests/setup.ts` 强制 `DATABASE_FILE=:memory:` 与 `EMAIL_BACKEND=console`(不看你本地 .env),
并在 `beforeAll` 用 `applyLocalMigrations()` 建表、`beforeEach` 清表。工厂在 `tests/helpers.ts`。
**新增测试请勿发真邮件、勿连网络。**

### 7.5 服务端 fetch 不转发 Set-Cookie

`src/lib/api-client.ts` 的 `apiGet/apiSend` 是**服务端**请求自家 API:它会转发**入站** cookie,
但拿不到响应里的 `Set-Cookie`。所以任何「需要设置 cookie」的流程(登录、登出)都必须由**浏览器**发起
(表单 POST / fetch),不要用 `apiSend`。这是 #24 的根因。

### 7.6 沙箱/构建注意

- 用 `node ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` 做类型检查。
- esbuild/workerd 需要构建脚本许可(pnpm 供应链策略);若 `pnpm install` 后命令找不到,检查
  `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`。
- Worker 里**不要静态 import `node:*`**:本地 SQLite 驱动用 `process.getBuiltinModule('node:sqlite')`
  惰性加载(见 `src/lib/db/index.ts`),否则 Worker 包会坏。
- 部署必须整包上传(`.deploy/` 含 `server-functions/`),`_routes.json` 把静态资源排除出 Worker。

### 7.7 手工验证的两个小工具(本次会话用过)

- **看 Worker 日志**(确认邮件是否被 Resend 接受):
  `wrangler pages deployment tail <deployment-url> --project-name=4seas-communityos --format pretty`
  日志里会打印 `[email:resend] accepted <id> -> <to> | <subject>`。
- **造一个可用登录链接**(不必读邮箱,便于端到端验证):
  随机生成 32 字节 base64url 作为明文 token,插入 `auth_tokens`(email/purpose=login/token_hash=sha256/expires_at),
  直接用 `/login/verify?token=<明文>`。token 哈希算法见 `src/modules/auth/service.ts` 的 `hashToken`。
- **造会话 cookie**:用 `.env` 的 `SESSION_SECRET` 按 `src/lib/auth/session.ts` 的 payload 结构签一个 HS256 JWT,
  作为 `cos_session` cookie 使用(仅用于线上只读验证)。

## 8. 开放问题 / 需要人决策

1. **品牌名**:当前邮件署名与发件人显示名是 `4Seas Community`。需求方口述过 `Forty Community`,**待确认**;
   若确为 Forty,改 `EMAIL_BRAND_NAME` 与 Pages 的 `EMAIL_FROM` 即可,无需改代码。
2. **Luma / Social Layer 真实对接**:代码与测试完备,但缺凭据。Luma 需要 Luma Plus 的 API key;
   Social Layer 需要服务账号 JWT(见 docs/09)。凭据就绪后跑 `scripts/luma-login.mjs`、`scripts/sola-token.mjs`,
   再触发 `POST /v1/integrations/sync/run`。
3. **4seasbot 侧适配**:4Seas-bot 仓库的 PR(CommunityOS 作为活动数据源,默认关闭)待其维护者合并;
   本系统侧接口已就绪(`GET /v1/integrations/bot/events|notifications`,`BOT_FEED_TOKEN` 服务鉴权)。
4. **CAS 真实部署**:目前 `CAS_API_URL` 未配置时会用内存 mock(仅 dev);生产接入需先在
   Community-Account-System 仓库部署(docs/06)。
5. **SMTP/发信配额**:现在只有 Resend 一条路;若 idoris.ai 的 send-only key 需要轮换,
   更新 `RESEND_API_KEY` secret 后重新部署。
6. **V2(链上积分 / NFT 签到 / Mini App)**:明确暂不做(docs/07)。

## 9. 接手后的第一步(建议顺序)

1. `pnpm install && pnpm db:migrate && pnpm test` —— 确认 85 个测试全绿。
2. 读 docs/02(产品范围)、docs/03(领域模型)、docs/10 §3(第二批计划)。
3. `curl -s https://4seas-communityos.pages.dev/v1/healthz` —— 应返回
   `{"ok":true,"database":"d1 (reachable)","problems":[]}`。
4. 登录管理台:用邮箱一次性链接(见 5 节)以 `jhfnetboy@gmail.com` 进入 `/admin`,熟悉现有两个队列页面。
5. 从 **2.3 通知发送记录**开始做(数据现成、页面模式与 `/admin/bookings` 一致,最容易上手)。
6. 每完成一项:更新 docs/10 §3 勾选与 §4 进度表 + 本文档第 6 节的完成标记,然后开 PR。

## 10. 关键文件地图

| 关注点 | 文件 |
| --- | --- |
| 数据库句柄(双驱动:D1 / node:sqlite) | `src/lib/db/index.ts`、`src/lib/db/sqlite.ts` |
| SQLite 迁移(含触发器) | `drizzle/0000_clumsy_malice.sql`、`drizzle.config.ts` |
| 本地迁移应用 | `src/lib/db/migrate-local.ts`、`scripts/migrate.ts`、`tests/setup.ts` |
| HTTP 路由 + 鉴权 + 审计中间件 | `src/lib/http.ts`、`src/lib/app-router.ts` |
| 会话与角色 | `src/lib/auth/session.ts`、`src/lib/auth/roles.ts`、`src/lib/session-server.ts` |
| 邮件(Resend + 品牌外壳) | `src/lib/email.ts`、`src/lib/config.ts` |
| Admin 服务与界面 | `src/modules/admin/*`、`src/app/admin/**`、`src/components/admin-forms.tsx` |
| 预订规则引擎 | `src/modules/booking/service.ts` |
| 活动生命周期 | `src/modules/event/service.ts`、`state-machine.ts` |
| 机器人 feed | `src/modules/integration/routes.ts`、`service.ts` |
| Agent API / MCP | `src/modules/agent/*`、`mcp/server.mjs` |
| 部署 | `scripts/cf-stage.sh`、`wrangler.jsonc`、docs/08 |
