# 10 · 交付差距分析(Gap Analysis)

> 状态:**正在补齐中**
> 起因:交付后对照设计文档(docs/02 §3 信息架构、docs/05 M0/M1 范围)审计,发现运营后台
> (Admin)能力严重缺失——设计完备,但交付只覆盖了成员侧前端,后台管理与部分后端接口未实现。
> 本文档作为缺口清单与补齐进度跟踪表。

---

## 1. 审计结论

对照设计文档的运营后台 8 项要求,逐项核对代码后的结论:

| # | 设计要求(docs/02 §3) | 审计时状态 | 缺口性质 |
| --- | --- | --- | --- |
| 1 | 建筑/楼层/场地 CRUD + 规则 | 场地 CRUD 有 API;**建筑/楼层无任何接口**;场地无管理界面 | 后端缺 + 前端缺 |
| 2 | 预订审批与占用总览(时间线视图) | API 有(approve/reject/list);**无任何界面** | 前端缺 |
| 3 | 活动审批 | API 有(approve/publish);**无界面** | 前端缺 |
| 4 | 成员与角色管理 | **API 与界面全部缺失** | 后端缺 + 前端缺 |
| 5 | 通知模板与发送记录 | **API 与界面缺失**(仅有 bot 拉取的 outbox) | 后端缺 + 前端缺 |
| 6 | 集成管理(Luma/SL/4seasbot/Agent key) | 无界面;Agent key 仅命令行脚本;Luma/SL 开关仅环境变量 | 后端缺 + 前端缺 |
| 7 | 数据导出 | **API 与界面缺失** | 后端缺 + 前端缺 |
| 8 | 审计日志查看 | **只有写入,无查询接口与界面** | 后端缺 + 前端缺 |

导航栏(Home / Events / Venues / Create / Me)**无 Admin 入口**,`/admin` 路由不存在。

## 2. 三个阻塞性后果(比"缺页面"更严重)

1. **无人可成为 Admin** —— 创建场地/修改规则需要 `admin` 或 `venue_manager` 角色,
   但系统没有任何接口能授予角色。全库仅种子数据中的 `demo@4seas.example` 为 admin,
   线上新成员永远无法管理后台(API 层面即被拒)。
2. **建筑/楼层无法录入** —— 场地必须挂到建筑下,但 `POST /api/buildings`、
   `POST /api/floors` 均不存在;现有两栋楼 + 楼层由种子 SQL 灌入,运营方无法新增建筑。
3. **积分无管理入口** —— 积分发放/扣减只能直接操作 CAS,后台没有"为成员调整积分"的能力
   (docs/05 M0 明确列出"积分发放/调整")。

## 3. 补齐计划(两批)

### 第一批 · 补齐能力(解阻塞)

- [x] 1.1 建筑 CRUD:`POST/PATCH /api/buildings` + 楼层 `POST/PATCH /api/floors`
- [x] 1.2 `/admin` 入口 + 导航角色门控(仅 admin / venue_manager 可见)
- [x] 1.3 成员列表 `GET /api/admin/members` + 角色授予/撤销 `POST /api/admin/members/:id/roles`
- [x] 1.4 积分调整 `POST /api/admin/members/:id/points`(经 CAS 执行 + 本地镜像)
- [x] 1.5 `scripts/make-admin.ts` —— 解决冷启动:把第一个用户提升为 admin
- [x] 1.6 对应界面:建筑/楼层管理、成员与角色管理、积分调整

### 第二批 · 补齐运营可见性

- [ ] 2.1 预订审批界面 + 占用总览(时间线视图)
- [ ] 2.2 活动审批界面(待审队列)
- [ ] 2.3 通知发送记录界面
- [ ] 2.4 Agent key 管理界面(创建/吊销,替代命令行)
- [ ] 2.5 数据导出(CSV/JSON):活动、预订、场地、成员
- [ ] 2.6 审计日志查询接口与界面

## 4. 进度跟踪

| 批次 | 计划项 | 状态 |
| --- | --- | --- |
| 一 | 1.1 – 1.6 | ✅ 已交付(PR #19,线上验证 /admin 与 /api/admin/*) |
| 二 | 2.1 – 2.6 | 待开始 |
| 迁移 | Postgres/Neon → Cloudflare D1 | ✅ 已交付并线上验证(docs/08 §2) |

> 每完成一项,更新本表;第二批结束后做一次全量复查(对照 docs/02 §3 与 docs/05 范围)。

---

## 5. 新增阻塞:生产数据库(Neon)超出配额(2026-09-29)

**现象**:线上数据接口全部 500(`/api/venues`、`/api/buildings` 等);页面仍 200 但显示
"Could not load"。Neon 返回:

    Your account or project has exceeded the quota. Upgrade your plan to increase limits.

**定位**:Neon 项目 `purple-leaf-89343439`(database `communityos`)配额用尽,
分支状态仍为 `ready`,即数据库本身正常,是**账户/项目额度**被耗尽。
该项目同时服务于 **Listmonk 邮件系统**,因此影响面不止本系统。

**成因分析(需承认的设计失误)**:

1. 为实现 Workers 兼容,db 层采用了 **Neon 无状态 HTTP 驱动**(docs/08 §3),
   每个请求都会唤醒一次 compute —— 相比连接池方案显著更耗 compute 时长。
2. 审计期间在**同一个免费项目**里新建了 `communityos` + `communityos_test` 两个库,
   并多次跑迁移与集成测试。
3. 免费档 compute 额度有限(约 191.9 小时/月),实际 active time 已达 ~345 小时。

**候选解决方案**:

| 方案 | 成本 | 恢复耗时 | 长期性 |
| --- | --- | --- | --- |
| A. 升级 Neon(Launch ~$19/月) | 付费 | ~10 分钟 | 稳定,但仍按量计费 |
| B. 本地 docker Postgres + Cloudflare Tunnel | 免费 | ~30 分钟 | 依赖本机常开,不适合长期 |
| C. Fly.io Postgres | 免费档够用 | ~1 小时 | 较好;仍需 Workers 连接方案(Hyperdrive 或缺权限) |
| **D. Cloudflare D1(SQLite)** ✅ 已采纳 | 免费、无配额 | ~1 天 | 与 Pages/Workers 同生态,不再有独立配额 |

### 5.1 决策与结果(2026-09-29,已完成)

采纳 **D**,并已线上验收:

- **schema 双驱动**:9 个 schema 全部改为 `drizzle-orm/sqlite-core`(见 `src/lib/db/sqlite.ts`):
  `uuid`→`text`(JS 生成 UUID + SQL 兜底)、`timestamptz`→`integer(timestamp_ms)`、
  `jsonb`→`text(json)`、`text[]`→`text(json)`、`boolean`→`integer(boolean)`、`numeric`→`real`。
- **PG enum → CHECK 约束**:29 个 CHECK 恢复了枚举与不变量(status、时间顺序、非负积分)的库级保护。
- **排他约束 → 触发器**:`tstzrange` + `btree_gist` 的 EXCLUDE 改为 `bookings` 的 INSERT/UPDATE
  BEFORE 触发器(`RAISE(ABORT,'booking_overlap')`);已在线上验证会拒绝重叠档期。
- **事务 → 原子批**:D1 没有交互式事务,`createEvent` 从 `txDb.transaction` 改为 `db.batch([...])`:
  事件与预订同批提交/回滚,失败不会留下孤儿活动。
- **驱动**:生产走 D1 binding(`drizzle-orm/d1`),本地/测试走 node:sqlite
  (`drizzle-orm/sqlite-proxy`,`process.getBuiltinModule`,零新增依赖)。
- **测试**:去掉 docker Postgres 依赖,**62 个测试全绿、约 4 秒**,`pnpm test` 无需任何外部服务。
- **线上验收**:`/v1/healthz` → `{"ok":true,"database":"d1 (reachable)"}`;`/api/venues`、
  `/api/buildings`、`/api/events` 从 500 恢复为 200;`POST /api/auth/register` 写入成功;
  触发器在线上拒绝重叠预订。部署与运维步骤见 docs/08。
- **清理**:删除 `docker-compose.yml` 与 `pg`/`@neondatabase/serverless` 依赖;
  Postgres 迁移归档到 `drizzle-postgres/`。

**回归风险与缓解**:SQLite 无 `numeric` 精度类型(`areaSqm` 改为 `real`)、无 `jsonb`
(查询改用 `json_extract`);D1 的 batch 语义与 PG 事务一致(全成功或全回滚),但不支持
跨请求的交互式事务 —— 现有代码已无此用法。
