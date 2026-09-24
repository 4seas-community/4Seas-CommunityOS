# 04 · 集成架构(v2)

> v2 更新:Luma/Social Layer 均为**单向发布**(不回写);Social Layer 基于实测 API 设计并附 computer-use 兜底;Telegram 通知经 **4seasbot** 拉取式集成;Mini App 二期。
> 原则:核心数据在 CommunityOS;外部平台是分发镜像;身份/积分/签到归 CAS。

---

## 1. 集成全景

    +-----------------------------+
    |      4Seas CommunityOS      |
    |  (主数据源: Place/Event/Booking)
    +------+---------------+------+
           |               |
     出站发布          出站 feed(拉取)
           |               |
     +-----+-----+    +----+-----+
     |           |    | 4seasbot |----> Telegram 用户/群/频道
     v           v    +----------+
  +------+   +-------+
  | Luma |   | Social|
  |(单向)|   | Layer |
  +------+   |(单向) |
             +-------+

    +-----------------------------+
    |  CAS(账户/积分镜像/签到/NFT)  | <—— 接口消费(auth/points/checkin)
    +-----------------------------+

数据流向原则:

- **出站发布**:活动 published 时异步推送到 Luma / Social Layer(单向,只写不回读报名)。
- **出站 feed**:4seasbot 定时拉取本系统的活动数据与通知 outbox,投递到 Telegram。
- **入站(唯一)**:CAS 的 webhook(账户验证状态变更、积分变更镜像);外部平台的内容修改**不回写**。
- **对账**:每日任务比对外部平台上的活动状态(是否存在/已取消),差异进人工队列。

---

## 2. Luma 集成(单向发布)

### 2.1 能力与约束(来自官方文档)

- 认证:x-luma-api-key 请求头;Calendar key 限流 200 次/分钟,Organization key 500 次/分钟;超限 429 需退避。
- 取消两步流程:先取 cancellation_token(15 分钟有效)再执行;不可逆,自动通知全部嘉宾。
- 封面图:须先上传 Luma CDN(images/create-upload-url)再引用。
- 前置条件:Luma Plus 订阅。

### 2.2 字段映射(我方 -> Luma create/update event)

| CommunityOS | Luma API 字段 | 备注 |
| --- | --- | --- |
| title | name | |
| start_at / end_at | start_at / end_at | ISO 8601 |
| timezone | timezone | 必填 |
| description | description_md | Markdown |
| banner_url | cover_url | 必须先上传 Luma CDN |
| event_type + venue_id | geo_address_json | manual / lookup / google place_id;线上用 meeting_url |
| visibility | visibility | public / private / members |
| max_capacity | max_capacity | |
| waitlist_enabled | waitlist_status | |
| registration_questions | registration_questions | |
| tags | 日历 event tags | 先确保 tag 存在 |
| program | 日历 | 一个 Program 映射一个 Luma calendar |
| is_paid / price_info | ticket_types | 付费需日历绑定 Stripe |
| entry_requirements / transport_info | description_md 追加固定小节 | Luma 无专用字段 |
| host / co_hosts | hosts | manager / check-in 两级 |

### 2.3 同步流程(单向)

出站(活动 published 或更新时):

1. banner 为本地图片则先上传 Luma CDN 换取 cover_url。
2. POST /events/create(已有映射则 update)。
3. 写 SyncRecord:{platform: "luma", external_id, slug, status, synced_at}。
4. 失败:指数退避(客户端自限 150/min 留余量),5 次后 dead_letter,通知 Admin。

取消:两步 token 流程;同步标记 canceled。

对账(每日):拉取 Luma 侧活动列表,比对存在性与状态;外部人工修改产生差异时**以我方为准重新覆盖或人工确认**,不自动回写我方。


### 2.5 成本与免费替代方案(2026-09 实测)

- **Luma API 需要 Luma Plus**(官方文档明确:"To use the Luma API, you need a Luma Plus subscription";API Key 在 luma.com/calendar/manage/api-keys 按日历签发,Calendar key 限流 200/min)。免费版**不能**通过 API 自动发布,Zapier 自动化同样属于 Plus 功能。
- Luma 免费版:无限活动与嘉宾、每周 500 封邀请/newsletter、付费活动 5% 平台费、无 API、无 Zapier。
- Luma Plus(日历级订阅,月付/年付,年付约省 11%,美元计价;额外 admin 席位 $12/月;额外发送 $50/月/5k 档):0% 平台费、5000 发送/周、API + Zapier、自定义 URL、票务收税、check-in manager 角色。当前确切订阅价以 lu.ma/pricing 页面为准(价格为动态渲染,未能抓到具体数字)。
- **免费自动发布路径**:
  1. **Social Layer(sola.day)API 免费可用**——4Seas 已在用,单向发布走服务账号 JWT(见第 3 节),零成本;
  2. **本系统自有活动页 + iCal + 4seasbot 分发**——完全自控;
  3. computer-use 浏览器自动化操作免费 Luma 账号——可行但脆弱,仅作兜底;
  4. 半自动:系统生成 Luma 就绪内容,运营一键粘贴。
- **建议**:若 Luma 继续作为对外门面,订阅一个 4Seas 日历的 Plus(付费活动多时 0% 平台费即可覆盖成本);否则一期用 Social Layer + 自有页面对外分发,Luma 同步留到 Plus 就绪。

### 2.4 风险与对策

| 风险 | 对策 |
| --- | --- |
| Luma Plus 未订阅/失效 | 功能开关降级:仅站内发布;后台提示订阅状态 |
| 限流 429 | 队列 + 客户端令牌桶自限 |
| 封面上传失败 | 场地/社区默认封面兜底 |
| 双端信息漂移 | 每日对账;我方为权威源 |
| 取消误操作 | 两步确认 + 审计 |

---

## 3. Social Layer 集成(单向发布)

### 3.1 API 实况(2026-09 实测调研)

Social Layer 前端开源(sociallayer-im/seastar-app),其中 packages/sola-sdk 揭示了完整的 **api.sola.day/api/v1** REST 契约(未公开文档,但已实测可用;4Seas-bot 已在用其只读端点)。要点:

- **读**:GET /events?group_id=4seas&collection=upcoming(结构化 JSON);GET /groups/4seas/calendar.ics(iCal,REFRESH-INTERVAL 1h)
- **写(需 JWT)**:POST /events(创建,roles/tickets 可内联一次性提交);PATCH /events/:id;DELETE /events/:id(软取消,参会者收到 CANCEL .ics);POST /events/:id/approve
- **报名**:POST /events/:id/participants(报名);POST /events/:id/participants/check_in(**签到**);approve / reject 参会者
- **场地**:POST /venues / PATCH / DELETE / POST /venues/:id/availability;GET /venues/:id/conflict(冲突检测)
- **认证**:邮箱一次性验证码(request_code/verify_code → JWT)、手机验证码、Google OAuth、SIWE 钱包登录

### 3.2 方案:服务账号 + API(首选)

- 使用 4Seas group manager 账号(邮箱验证码登录获取 JWT;或 OAuth)。服务端安全存储 refresh 机制。
- 活动 published 时 POST /events 创建,body 带 group_id=4seas、event 字段、内联 tickets;更新用 PATCH;取消用 DELETE。
- 场地可同步创建/更新(POST /venues + availability),保持双边场地一致。
- **契约风险**:API 无公开文档,字段可能变更——同步器对所有字段容错,解析失败跳过单条,不阻断主流程(与 4Seas-bot 的容错策略一致)。

### 3.3 兜底方案:computer use(API 不可用时)

- 若服务账号 API 路径受阻(权限/契约变更),降级为 **computer use 自动化**:持 4Seas 的 sola.day 账号,用浏览器自动化在 Web 界面完成活动创建(标题/时间/地点/描述/封面)。
- 该模式只用于单向发布的兜底,不作为首选;失败进入人工队列并告警。

### 3.4 与 4seasbot 的数据源关系(重要)

4seasbot 当前从 Social Layer 拉活动。本系统上线后:

- 4seas-bot 增加 **CommunityOS 数据源适配器**(拉本系统 API),置于 fallback 链最上游:CommunityOS API → Sola API → Sola iCal → 本地 YAML。
- 过渡期两个数据源可能重复(同一活动两边都有),bot 侧按 (source, event_id) 幂等去重;本系统活动在 Social Layer 的镜像由本系统同步器负责,bot 不再需要直接读 sola.day(保留为兜底)。

---

## 4. Telegram 通知:经 4seasbot

### 4.1 4seasbot 现状(调研结论)

- Python + python-telegram-bot,独立服务(systemd/launchd 部署),本地 SQLite。
- 已有能力:每日 digest(19:00 Asia/Bangkok)、活动同步(可插拔事件源 + fallback 链)、/ask 问答、关键词触发、自定义命令、admin web 控制台(127.0.0.1:8477)。
- 架构是**定时拉取 + 本地库**,没有入站 webhook API。

### 4.2 集成方案:拉取式 outbox(一期)

本系统不直接推 Telegram,而是暴露两个出站 feed,由 4seasbot 拉取:

    GET /v1/integrations/bot/events?from=&to=       # 活动列表(JSON,含场地/时间/链接)
    GET /v1/integrations/bot/notifications?since=   # 通知 outbox(待投递消息)
    POST /v1/integrations/bot/notifications/{id}/ack # 投递回执(可选,用于去重)

- 4seas-bot 新增一个 CommunityOS source 适配器(约一个小 PR):在既有 sync job 里增加数据源,沿用其幂等 UPSERT、content_hash、窗口软删除机制。
- 通知 outbox 记录:目标(chat_id / user telegram id,经 CAS 绑定关系解析)、模板变量、渠道、状态。
- 投递节奏:digest 19:00(沿用现有 schedule);提醒类 T-24h/T-1h 由 bot 侧 job 按活动时间计算,或本系统在 outbox 标注 scheduled_at,bot 到点投递。

### 4.3 为什么不是推送

- 4seasbot 无入站 API,新增入站端点等于扩大既有服务的攻击面,且要改部署;
- 拉取式与 bot 现有架构一致(可插拔源 + 本地库 + 失败重试),改动最小;
- 本系统因此完全不接触 Telegram Bot Token——Token 只在 4seasbot 处,职责清晰。

### 4.4 二期:Mini App

- Telegram Mini App(完整创建/预订表单)二期实现;入口由 4seasbot 的菜单按钮/命令唤起,指向本系统 Web 端的 Mini App 模式(同一前端,initData 换 token,经 CAS 鉴权)。
- 一期不依赖 Mini App:通知 + /events 类命令 + Web 端覆盖核心场景。

---

## 5. CAS 集成(账户/积分镜像/签到)

本系统通过 CAS 客户端模块消费(详见 06-community-account-system.md):

- **Auth**:注册/验证/登录/会话校验全部走 CAS;本系统只存 cas_user_id 与角色。
- **Points(镜像)**:CAS/链上为权威;本系统定时同步余额与流水到本地镜像表,仅供展示;预订扣减(当前为 0)通过 CAS 接口执行。
- **Check-in**:活动签到的"一次性领取网址 + 签名"由 CAS 签发;本系统负责主持人二维码轮换与现场扫码流程,领取结果回写 CAS。
- **NFT(V2)**:CAS 对接外部 NFT 系统,本系统不直接对接 NFT。

---

## 6. Agent API(REST + MCP)

(与 v1 一致,保留)

### 6.1 设计基线(借鉴 luma-mcp)

1. 读直接执行,写 draft+confirm(草稿 1 小时过期、一次性确认)。
2. 独立身份与 scope:每个 Agent 一个 API key,可吊销。
3. 全量审计(JSONL + 后台可查)。
4. 脱敏与注入清洗(NFKC、去零宽字符)。
5. 零 LLM 决策;限流 60 次/分钟/key。

### 6.2 REST 节选

    # 读(直接执行)
    GET  /v1/venues, /v1/venues/{id}, /v1/venues/{id}/availability
    GET  /v1/events, /v1/events/{id}, /v1/events/{id}/registrations

    # 写(draft + confirm)
    POST /v1/events/draft                      -> {draft_id, preview}
    POST /v1/events/draft/{draft_id}/confirm   -> 201
    DELETE /v1/events/draft/{draft_id}         -> 幂等
    POST /v1/bookings/draft / confirm
    POST /v1/events/{id}/cancel                -> 两步

### 6.3 MCP 工具清单(节选)

读工具:community_health、search_venues、check_availability、get_event、list_events、get_venue_rules、get_my_points(镜像余额)。

写工具(draft+confirm 对):create_event、update_event、cancel_event、create_booking、register_event;cancel_draft(幂等)。

每个 draft 返回结构化预览(冲突检查、规则校验、积分预估);confirm 时执行与人类用户完全相同的发布链路(含 Luma/Social Layer 同步与通知)。

---

## 7. 通知与邮件

- 邮件:本系统直发(事务邮件:Resend/SES);注册验证邮件由 CAS 负责。
- Telegram:经 4seasbot 拉取 outbox(见第 4 节)。
- 站内:通知中心存档。
- 触发矩阵见 02-product-plan.md 5.5。

---

## 8. 集成配置与管理

后台"集成管理"页:Luma key 状态与订阅检测、Social Layer 服务账号状态、4seasbot feed 地址与 token、Agent key 创建/吊销/scope。所有集成开关独立、失败可见(队列深度、最近错误),全部写入审计日志。
