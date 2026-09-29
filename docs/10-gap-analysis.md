# 10 · 交付差距分析(Gap Analysis)

> 状态:**全部补齐完成 (两批共 12 项均已交付并合入 main)**
> 起因:交付后对照设计文档(docs/02 §3 信息架构、docs/05 M0/M1 范围)审计,发现运营后台
> (Admin)能力严重缺失——设计完备,但交付只覆盖了成员侧前端,后台管理与部分后端接口未实现。
> 本文档记录缺口清单、补齐过程以及全量复查结论。

---

## 1. 审计结论与解决对照

对照设计文档的运营后台 8 项要求,经两批专项交付后的最终状态:

| # | 设计要求(docs/02 §3) | 审计时状态 | 交付后状态 | 对应交付 |
| --- | --- | --- | --- | --- |
| 1 | 建筑/楼层/场地 CRUD + 规则 | 建筑/楼层无接口,场地无界面 | ✅ 已补齐:建筑/楼层/场地 CRUD API + 规则管理界面 | PR #19 (`/admin`) |
| 2 | 预订审批与占用总览(时间线视图) | API 有,无界面 | ✅ 已补齐:待审预订审批/驳回 + 14 天场地占用网格 | PR #23 (`/admin/bookings`) |
| 3 | 活动审批 | API 有,无界面 | ✅ 已补齐:`pending_review` 待审活动队列与一键发布 | PR #23 (`/admin/events`) |
| 4 | 成员与角色管理 | API 与界面缺失 | ✅ 已补齐:成员查询、角色授予/撤销、积分调整 | PR #19 (`/admin`) |
| 5 | 通知模板与发送记录 | API 与界面缺失 | ✅ 已补齐:通知发送日志查询(PII保护)、失败一键重试 | PR #27 (`/admin/notifications`) |
| 6 | 集成管理(Luma/SL/4seasbot/Agent key) | 无界面,仅脚本 | ✅ 已补齐:Agent Key 创建(一次性回显)、吊销与权限管理 | PR #28 (`/admin/agent-keys`) |
| 7 | 数据导出 | API 与界面缺失 | ✅ 已补齐:活动/预订/场地/成员 CSV (RFC 4180/BOM)与 JSON 导出 | PR #29 (`/admin/export`) |
| 8 | 审计日志查看 | 只有写入,无查询与界面 | ✅ 已补齐:复合游标分页查询 API 与多维度过滤日志页面 | PR #30 (`/admin/audit`) |

导航栏(Home / Events / Venues / Create / Me / Admin)已支持角色动态门控,非管理员不可见,未授权访问阻断。

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

- [x] 2.1 预订审批界面 + 占用总览 —— `/admin/bookings`:待审批列表(批准/驳回 + note)+ 未来 14 天
      各场地占用网格(PR #23,线上验证)
- [x] 2.2 活动审批界面(待审队列)—— `/admin/events`:`pending_review` 队列 + Approve & publish,
      配套 `listEvents` 的 `status` 过滤(PR #23,线上验证)
- [x] 2.3 通知发送记录界面 —— `GET /api/admin/notifications` + `/admin/notifications` 页面(状态/渠道/模板过滤 + PII admin 门控 + 重试 + 审计)
- [x] 2.4 Agent key 管理界面 —— `GET/POST /api/admin/agent-keys` + `DELETE /api/admin/agent-keys/:id` + `/admin/agent-keys` 页面(一次性回显明文/按需吊销/安全无hash回显/写审计)
- [x] 2.5 数据导出(CSV/JSON):活动、预订、场地、成员 —— `GET /api/admin/export` + `/admin/export` 页面(CSV RFC 4180/BOM/CRLF/ISO 8601/JSON 导出/Admin门控)
- [x] 2.6 审计日志查询接口与界面 —— `GET /api/admin/audit` + `/admin/audit` 页面(组合游标分页/操作者与变更JSON详情展开/PII Admin门控)

## 4. 进度跟踪

| 批次 | 计划项 | 状态 |
| --- | --- | --- |
| 一 | 1.1 – 1.6 | ✅ 已交付(PR #19,线上验证 /admin 与 /api/admin/*) |
| 二 | 2.1 – 2.2 | ✅ 已交付(PR #23,线上验证两个队列页面与占用网格) |
| 二 | 2.3 | ✅ 已交付(通知记录与重试 /admin/notifications) |
| 二 | 2.4 | ✅ 已交付(Agent key 创建/吊销 /admin/agent-keys) |
| 二 | 2.5 | ✅ 已交付(数据导出 CSV/JSON /admin/export) |
| 二 | 2.6 | ✅ 已交付(审计日志查询与分页 /admin/audit) |
| 二 | 全部 (2.1–2.6) | ✅ 全部交付完成，运营可见性完整闭环 |
| 迁移 | Postgres/Neon → Cloudflare D1 | ✅ 已交付并线上验证(docs/08 §2) |
| 邮件 | 事务邮件经 Resend(`hello@idoris.ai`)+ 4Seas 品牌 | ✅ 已交付(PR #22/#26,真机投递验证) |
| 登录 | 邮箱一次性链接一键登录 | ✅ 已交付(PR #24/#25,含失败态诊断) |
| 硬化 | API 错误契约 401/400(原为 500) | ✅ 已交付(PR #21) |

### 4.1 全量复查结论 (对照 docs/02 §3 与 docs/05 范围)

第二批交付完毕后,对整体系统做全量对照复查,结论如下:

1. **docs/02 §3 信息架构与运营后台 8 项要求全面达成**:
   - 建筑/楼层/场地 CRUD 与规则配置:全面支持并在 `/admin` 统一管理。
   - 预订审批与占用时间线:在 `/admin/bookings` 提供审批工作流与 14 天场地占用甘特网格。
   - 活动审批:在 `/admin/events` 支持 `pending_review` 待审活动队列查看与一键发布。
   - 成员与角色管理:在 `/admin` 支持成员查询、Admin/Venue Manager 角色授权与 CAS 积分镜像调整。
   - 通知记录与运维:在 `/admin/notifications` 支持发送日志多维度检索、脱敏 PII 保护与失败重发。
   - 集成管理 (Agent Key):在 `/admin/agent-keys` 支持密钥生成(一次性明文回显)、即时吊销与权限 scope 校验。
   - 数据导出:在 `/admin/export` 支持活动、预订、场地、成员的 CSV (RFC 4180 / UTF-8 BOM / CRLF) 及 JSON 规范导出。
   - 审计日志:在 `/admin/audit` 支持按操作者/实体/时间筛选、变更前后 JSON 对比、以及 `(createdAt, id)` 复合游标稳定分页。
2. **docs/05 阶段范围落地情况**:
   - **M0 地基**:已完全实现。无状态 Cloudflare Pages + D1 数据库 + Resend 事务邮件 + 邮箱一次性一键登录。
   - **M1 运营闭环**:已完全实现。场地预订、防重叠触发器、审批流、签到二维码与 4seasbot feed 接口均已闭环。
   - **M2 分发与 Agent**:核心能力已落地。Agent REST API + MCP Server + Key 管理与审计日志已具备;数据导出已落地;Luma / Social Layer 单向发布逻辑就绪(待生产外部密钥接入即生效)。
3. **自动化测试与质量**:
   - 全库测试文件 17 个,共 **98 项测试全部通过**,执行耗时约 7 秒;TypeScript 全局类型检查 0 报错。

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
