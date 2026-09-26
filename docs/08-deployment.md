# 08 · 部署与发布(Cloudflare Pages)

## 1. 结论:可以发布到 4seas-communityos.pages.dev

本系统(Next.js 15 App Router)已按 Cloudflare Workers/Pages 运行时配置完成:

- 适配器:@opennextjs/cloudflare(open-next.config.ts)
- 构建产物:.open-next/(worker.js + assets),pnpm cf:build 一条命令
- 本地已验证:next build(standalone)→ OpenNext worker 构建通过
- 配置:wrangler.jsonc(name=4seas-communityos,nodejs_compat,Hyperdrive 绑定)

## 6. 当前线上环境(2026-09-25 实录)

- **URL**:https://4seas-communityos.pages.dev(全部页面/API 200)
- **Pages 项目**:4seas-communityos(production branch = main)
- **Worker 入口**:.open-next/worker.js(OpenNext for Cloudflare)
- **静态资源**:.deploy/_routes.json 把 /_next/static 与图片排除出 worker,由 Pages 直接服务
- **数据库**:Neon(复用账号既有项目 purple-leaf-89343439,新建 database communityos,
  role communityos;测试库 communityos_test)。连接串经 Pages secret DATABASE_URL 注入
- **驱动**:Workers 上用 Neon 无状态 HTTP 驱动(每个查询一次 HTTPS 请求,规避 Worker 上的
  socket 生命周期问题);交互式事务用 WebSocket Pool(txDb)
- **凭据**:CLOUDFLARE_API_TOKEN(账户级,与 internal-AI/cf-pages 共用)、CF_ACCOUNT_ID、
  NEON_API_KEY —— 均来自 ~/Dev/.env 与 ~/Dev/mycelium/blog/.env,勿入库
- **已知取舍**:OpenNext 会把 Next standalone server(node_modules 追踪副本)打包成
  Worker,产物约 2700 文件/5MB —— 这是 Next.js on Workers 的正常形态,非错误

## 7. M2 已交付(2026-09-25)

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Luma 单向发布 | ✅ 代码+测试(PR #14) | mapper/client/sync;真实对接需 Luma Plus(LUMA_API_KEY + LUMA_ENABLED) |
| Social Layer 单向发布 | ✅ 代码+测试(PR #15) | sola.day API(SDK 字段);需服务账号 JWT(SOCIAL_LAYER_TOKEN) |
| 同步 outbox 处理器 | ✅ | `POST /v1/integrations/sync/run`(service token),供 cron 触发 |
| Agent API | ✅ 线上验证(PR #16) | `/v1/agent/*` 读开放、写 draft+confirm(1h 过期、单次确认、幂等取消) |
| MCP server | ✅ | `mcp/server.mjs`,零依赖 stdio,9 个工具代理 Agent API |

**Agent API 线上端到端验证**(4seas-communityos.pages.dev):
读取场地 → 创建事件草稿(拿到 preview)→ confirm 落库 → `/api/events` 可见 → 重复 confirm 被拒 → 未绑定成员的 key 写入被拒。

运维命令:

    # 生成 Agent key(密钥只显示一次)
    pnpm tsx scripts/agent-key.ts "claude-desktop" "venues:read,events:read,events:write,bookings:write"

    # MCP(本地 stdio)
    COS_API_URL=https://4seas-communityos.pages.dev COS_AGENT_KEY=cos_ak_... node mcp/server.mjs
