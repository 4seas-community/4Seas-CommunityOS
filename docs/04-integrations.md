# 04 · 集成架构

> Luma 同步、Social Layer 同步、Telegram Bot & Mini App、Agent API(REST + MCP)、通知与邮件基础设施。
> 原则:核心数据在 CommunityOS;外部平台是分发镜像与回流入口。

---

## 1. 集成全景

    +-----------------------------+
    |      4Seas CommunityOS      |
    |  (主数据源: Place/Event/People)|
    +--------------+--------------+
                   |
     +-------------+-------------+-------------+
     |             |             |             |
     v             v             v             v
  +------+     +------+     +--------+     +---------+
  | Luma |     |Social|     |Telegram|    |  Agent  |
  | 镜像 |     |Layer |     |Bot/App |    | API/MCP |
  +------+     +------+     +--------+     +---------+
     ^             ^             ^
     |             |             |
  出站发布      出站发布      出站通知
  入站 webhook  (API/iCal)   入站 initData/命令

数据流向原则:

- **出站(发布)**:我方活动状态变为 published 时,按集成配置异步推送到各平台。
- **入站(回流)**:仅限明确契约的数据(Luma 的报名/取消/退款 webhook;Telegram 的 initData 与命令)。外部对活动内容的修改不回写。
- **对账**:每日任务比对 SyncRecord 与外部平台状态,差异进入人工队列。

---

## 2. Luma 集成(双向)

### 2.1 能力与约束(来自官方文档)

- 认证:请求头 x-luma-api-key;Calendar key 限流 200 次/分钟,Organization key 500 次/分钟;超限 429 需退避重试。
- 取消活动两步流程:先 POST /events/cancel/request 获取 cancellation_token(15 分钟有效),再 POST /events/cancel;不可逆,自动通知全部嘉宾并退款。
- 封面图:需先 POST /images/create-upload-url 上传至 images.lumacdn.com,再用返回的 file_url。
- 日历投稿-审批:calendar events add / approve / reject(可作为我们"活动审核"流程的映射)。
- 嘉宾:add / update-status(approved/declined/pending_approval/waitlist,可退款)/ send-invites(邮件+短信)。
- Webhooks:event.created / updated / canceled;guest.registered / updated / refunded;ticket.registered;calendar.event.added / submitted;calendar.person.subscribed / unsubscribed。
- 前置条件:Luma Plus 订阅(公开 API 门槛)。

### 2.2 字段映射(我方 -> Luma create/update event)

| CommunityOS | Luma API 字段 | 备注 |
| --- | --- | --- |
| title | name | |
| start_at / end_at | start_at / end_at | ISO 8601 |
| timezone | timezone | 必填 |
| description(markdown) | description_md | |
| banner_url | cover_url | 必须先上传 Luma CDN |
| event_type + venue_id | geo_address_json | {type: "manual", address} 或 {type: "lookup", query};线上活动用 meeting_url |
| visibility | visibility | public / private / members |
| max_capacity | max_capacity | |
| waitlist_enabled | waitlist_status | enabled / disabled |
| approval_required | registration_open + 审批流 | 站内审批由我们控制;Luma 侧报名默认 approved |
| registration_questions | registration_questions | |
| tags | 日历 event tags | 需先 ensure tag 存在 |
| program | 日历 | 一个 Program 映射一个 Luma calendar |
| is_paid / price_info | ticket_types | 付费需日历绑定 Stripe;免费则默认 Standard 票 |
| entry_requirements | description_md 追加段落 | Luma 无专用字段 |
| transport_info | description_md 追加段落 或 geo address description | |
| host_id / co_host_ids | hosts(add) | manager / check-in 两级 |

映射规则:

- 所有 Luma 不覆盖的字段(交通路线、入场要求、场地规则)统一追加到 description_md 末尾的固定小节,保证对外信息完整。
- 发布即生成 Luma 侧唯一 slug 存入 SyncRecord;我方详情页同时提供跳转 Luma 报名页或内嵌报名(二选一由活动配置)。

### 2.3 同步流程

出站(活动发布时):

1. 若 banner 为本地图片:调用 images/create-upload-url 上传,换取 cover_url。
2. POST /events/create(或已有映射则 update)。
3. 写入 SyncRecord: {platform: "luma", external_id, slug, status: synced, synced_at}。
4. 失败:指数退避重试(尊重 200/min 限流),5 次后进入 dead_letter,通知 Admin。

入站(webhook):

- guest.registered -> 在我方创建/更新 Registration(source=luma_webhook);若该成员未注册,自动创建 unverified 账户并发送验证邮件(转化漏斗)。
- guest.updated / guest.refunded -> 同步状态。
- event.canceled(外部取消)-> 标记差异,进入对账队列(不自动取消我方活动,防止误删;由管理员确认)。

取消我方活动时:

1. 读 SyncRecord 取 luma event id。
2. POST /events/cancel/request 取 token -> POST /events/cancel(should_refund 按活动付费类型)。
3. 更新 SyncRecord 为 canceled;通知报名者(以我方通知为主,Luma 也会自动发)。

### 2.4 风险与对策

| 风险 | 对策 |
| --- | --- |
| Luma Plus 未订阅/过期 | 功能开关降级:仍生成活动页,仅不同步;后台提示订阅状态 |
| 限流 429 | 队列 + 令牌桶限流器(客户端自限 150/min,留余量) |
| 封面上传失败 | 使用场地/社区默认封面兜底,记录 warning |
| 双端信息漂移 | 每日对账任务;我方为权威源,差异以"重新推送覆盖"或"人工确认"处理 |
| 取消误操作 | 两步确认 + 审计日志 |

---

## 3. Social Layer 集成

### 3.1 现状

4Seas Community 当前在 Social Layer(app.sola.day)发布活动,场地命名已采用"建筑-楼层-空间"结构,与我们的模型天然兼容。Social Layer 定位为模块化社会基础设施,提供身份/徽章、日程、RSVP;其协议开源,但产品化 API 的开放程度需验证。

### 3.2 方案

- 方案 A(首选,若开放可写 API):与 Luma 相同的镜像模式——活动发布时同步到 4Seas 的 Social Layer group;若提供 webhook 则回流报名。
- 方案 B(过渡,无公开写 API):
  - 我方提供标准 iCal 订阅地址(按 Program/场地/标签过滤),Social Layer 侧如有日历订阅能力可直接消费;
  - 我方活动详情页提供"添加到 Social Layer"深链;
  - 保留 sola.day 页面作为对外入口之一,逐步迁移。
- 方案 C(长期):以徽章/参与凭证形式对接——成员参与记录导出为可验证凭证(Social Layer 徽章、POAP),强化"可携带身份"。

**决策点**:需要先确认 sola.day 是否有开放 API(见 05-roadmap.md 开放问题 Q1)。无论哪种方案,SyncRecord 结构保持一致,后端可平滑切换。

---

## 4. Telegram Bot & Mini App

### 4.1 架构

    Telegram 用户
       |  /newevent, /book, /today, /myevents ...
       v
    +--------+   initData 签名验证   +------------------+
    |  Bot   +<--------------------->|  CommunityOS API |
    |(aiogram|                       |   (同一后端)      |
    | /gram) |                       +------------------+
    +----+---+                            ^
         | Mini App(React,复用 Web 端)     |
         +----------------------------------> 直接调用 REST

### 4.2 绑定与身份

- 用户首次使用 Bot:发送 /start,点击"绑定账户"-> 打开 Mini App -> 输入邮箱 -> 收到验证邮件 -> 验证后 Telegram ID 与 Member 绑定(initData 中取 id/username,服务端验签)。
- 未绑定用户使用 Bot:可浏览公开活动,报名时引导先注册。

### 4.3 命令与交互

| 命令/入口 | 行为 |
| --- | --- |
| /start | 欢迎 + 绑定引导 |
| /today,/week | 今日/本周日程(按钮跳转 Mini App 详情) |
| /newevent | 对话式快速创建:标题 -> 时间 -> 场地(内联键盘选择)-> 提交(走标准创建+规则校验) |
| /book | 预订引导:选场地 -> 选时段 -> 填用途 -> 提交 |
| /myevents,/mybookings | 我的活动与预订(含取消按钮) |
| /points | 积分余额与最近流水 |
| 通知推送 | 活动提醒、报名结果、审批请求(场地管理员收到"批准/拒绝"内联按钮) |
| 每日 digest | 早 8 点推送当日活动清单(可订阅/退订) |

### 4.4 Mini App(复杂表单)

- 复用 Web 端同一前端代码库(PWA),检测到 Telegram WebView 时启用 Mini App 模式(主题适配、MainButton、HapticFeedback)。
- 承载:完整活动创建表单、场地预订日历选择、报名表单、嘉宾名单与签到码。

### 4.5 群集成

- 社区群:活动发布时自动推送卡片(标题/时间/场地/报名按钮);支持 /event 命令查询。
- 频道:每日 digest 广播。

---

## 5. Agent API(REST + MCP)

### 5.1 设计基线(借鉴 luma-mcp 安全模式)

1. **读直接执行,写 draft+confirm**:查询类工具立即返回;所有创建/修改类工具分两步——draft 返回 draft_id(不产生业务副作用),confirm 才落库。草稿 1 小时过期、一次性确认。
2. **独立身份与 scope**:每个 Agent 一个 API key;scope 细化到资源与动作(如 events:read, bookings:write);支持随时吊销。
3. **全量审计**:JSONL 审计(actor key、tool、action、脱敏参数、结果、延迟、draft_id、confirm 人)。
4. **脱敏与注入清洗**:日志脱敏密钥字段;自由文本 NFKC 归一化、去零宽字符、中和角色伪装。
5. **零 LLM 决策**:工具内部路由全部规则化;限流(按 key:60 次/分钟)。

### 5.2 REST API(节选)

    # 读(直接执行)
    GET  /v1/venues?building=&amenities=&capacity_min=
    GET  /v1/venues/{id}
    GET  /v1/venues/{id}/availability?from=&to=
    GET  /v1/events?from=&to=&venue=&program=&tag=
    GET  /v1/events/{id}
    GET  /v1/events/{id}/registrations
    GET  /v1/me/points

    # 写(draft + confirm)
    POST /v1/events/draft                     -> {draft_id, preview}
    POST /v1/events/draft/{draft_id}/confirm  -> 201 {event_id}
    DELETE /v1/events/draft/{draft_id}        -> 幂等取消草稿
    POST /v1/bookings/draft
    POST /v1/bookings/draft/{draft_id}/confirm
    POST /v1/events/{id}/cancel               -> 同样两步(防误删)

### 5.3 MCP 工具清单(节选)

读工具(直接执行):

- community_health —— 连通性 + 权限自检
- search_venues —— 按建筑/楼层/设备/容量/时段查场地
- check_availability —— 场地可用性(含缓冲与规则)
- get_event / list_events —— 活动查询(支持时间范围/场地/Program 过滤)
- get_venue_rules —— 场地规则(活动类型/积分价/提前窗口)
- get_my_points —— 调用者(绑定的成员)积分余额

写工具(draft+confirm 对):

- create_event_draft / create_event_confirm
- update_event_draft / update_event_confirm
- cancel_event_draft / cancel_event_confirm
- create_booking_draft / create_booking_confirm
- register_event_draft / register_event_confirm(以绑定成员身份报名)
- cancel_draft(幂等)

每个 draft 工具返回结构化预览(含积分预估、冲突检查结果、规则校验结果),confirm 时才执行与人类用户完全相同的发布链路(含 Luma/Social Layer 同步与通知)。

### 5.4  Agent 与成员身份绑定

- Agent 可代表"已绑定成员"操作(如代成员报名),audit 中同时记录 agent_key 与 member_id。
- 未绑定的 Agent 只能读公开数据;写操作必须声明 member 绑定且该成员已验证。

---

## 6. 通知与邮件基础设施

### 6.1 邮件(事务型)

- 用途:注册验证(magic link/验证 token)、活动通知、预订结果、每日 digest。
- 要点:独立发信域名 + SPF/DKIM/DMARC;验证 token 24 小时有效、一次性、使用后失效;退订链接(营销类);发送记录入库可查。
- 供应商候选:Resend / AWS SES / Postmark(按成本与可达率评估)。

### 6.2 Telegram 推送

- Bot 主动消息(需用户先与 bot 交互过);频道 digest 广播;群卡片。

### 6.3 站内通知中心

- 所有通知存档,支持已读/未读、偏好设置(按事件类型开关渠道)。

### 6.4 通知触发矩阵(摘要)

| 事件 | 邮件 | Telegram | 站内 |
| --- | --- | --- | --- |
| 注册验证 | 必须 | - | - |
| 验证成功/欢迎 | 是 | 是(已绑定) | 是 |
| 活动发布 | 广播 | 群/频道 + 订阅者 | 是 |
| 活动提醒 T-24h / T-1h | 是 | 是 | 是 |
| 报名成功/待审批/被拒 | 是 | 是 | 是 |
| 活动改期/取消 | 是 | 是 | 是 |
| 预订提交/审批结果 | 是 | 是(含审批按钮) | 是 |
| 积分变动 | 周汇总 | 实时 | 是 |
| 每日 digest | 是(可订阅) | 是(可订阅) | 是 |

---

## 7. 集成配置与管理

- 后台"集成管理"页:Luma API key 状态与订阅检测、Social Layer 模式(A/B/C)、Telegram Bot token、Agent key 的创建/吊销/scope 编辑、webhook 端点与密钥。
- 每个集成有独立开关与限流配置;同步失败在后台可见(队列深度、最近错误)。
- 所有集成操作写入审计日志。
