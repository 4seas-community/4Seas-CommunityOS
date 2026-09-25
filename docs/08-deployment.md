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
