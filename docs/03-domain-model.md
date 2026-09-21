# 03 · 领域与数据模型(v2)

> v2 更新:身份/积分/签到归 CAS(本系统镜像);积分字段默认 0 但接口预留;新增 CheckinToken(活动 URL + 签名)与通知 outbox 实体。
> 本文档定义 4Seas CommunityOS 的核心领域模型、实体字段、状态机与关键约束,作为数据库设计与 API 实现的依据。

---

## 1. 领域全景

    Community(社区)
     |-- Building --> Floor --> Venue --> VenueRule(规则,版本化)
     |
     |-- Program(主题program)
     |
     |-- Member(本地档案,身份镜像自 CAS)
     |      |-- cas_user_id(关联 CAS 账户)
     |      |-- points_mirror(积分镜像,只读)
     |      |
     |      |-- Booking --(积分预留,默认 0)--> PointsLedger(本地流水镜像)
     |      |
     |      +-- Event --> Registration --> CheckinToken(CAS 签发)
     |             |
     |             +-- SyncRecord(Luma / Social Layer 单向发布记录)
     |
     +-- NotificationOutbox(供 4seasbot 拉取) / AuditLog(审计)

核心不变式(Invariants):

1. 一个场地在同一时间段(含缓冲)最多有一个 active 预订。
2. 活动报名人数不得超过活动容量与场地容量上限的较小值。
3. 只有 CAS 验证通过的成员(cas_verified=true)可以发起活动或预订场地。
4. 外部平台(Luma/Social Layer)的活动 ID 只存在于 SyncRecord,不进入核心实体。
5. 积分权威在 CAS/链上;本地 PointsLedger 只是镜像,禁止作为对账权威。
6. 所有签到领取网址一次性有效(使用后作废),受活动人数上限约束。

---

## 2. 实体定义

### 2.1 空间域(Space)

**Building 建筑**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| community_id | uuid | |
| name | string | 如 "Building F"、"4Seas Nimman" |
| address | string | |
| geo | point | 经纬度 |
| status | enum | active / maintenance / closed |
| cover_image | url | |
| description | text | |

**Floor 楼层**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id / building_id | uuid | |
| name | string | 如 "1st Floor" |
| sort_order | int | |
| map_asset | url | 平面图(可选) |

**Venue 场地**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id / building_id / floor_id | uuid | 归属 |
| name / code | string | 名称与编号(如 F1-EVENT) |
| area_sqm | decimal | 面积 |
| capacity_seated / capacity_standing | int | 容纳上限(两种口径) |
| amenities | string[] | 设备清单 |
| services | string[] | 基础服务 |
| opening_hours | jsonb | 按星期开放时段 |
| blackout_dates | date[] | 例外关闭 |
| photos | url[] | |
| status | enum | open / maintenance / closed |
| default_buffer_min | int | 默认缓冲(分钟) |
| sol_day_venue_id | string? | Social Layer 场地镜像 ID(同步用) |

**VenueRule 场地规则(版本化)**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id / venue_id / version | | 版本变更不影响已确认预订 |
| allowed_event_types | string[] | 活动类型白名单 |
| approval_mode | enum | auto / venue_manager / community_admin |
| points_per_hour | int | **默认 0**;V2 链上积分启用 |
| member_tier_discount | jsonb | 预留 |
| free_quota_applies | bool | 预留 |
| deposit_points | int | 预留,默认 0 |
| max_advance_days / min_advance_hours | int | 预订窗口 |
| max_duration_hours / max_hours_per_month | int | 时长上限 |
| cancellation_policy | jsonb | 取消政策 |
| prohibited_behaviors | text[] | 禁止行为条款 |
| access_requirement | enum | verified_members / roles / public |

### 2.2 活动域(Event)

**Event 活动**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id / community_id / program_id | uuid | |
| title / description | string / text | |
| start_at / end_at / timezone | | |
| event_type | enum | in_person / online / hybrid |
| venue_id | uuid? | 自运营场地(空 = 外部场地) |
| venue_snapshot | jsonb | 发布时场地快照 |
| external_location / geo | string? / point? | 外部场地 |
| transport_info | text | 交通路线 |
| meeting_url | string? | 线上链接 |
| banner_url | url? | 封面 |
| suggested_attendees / max_capacity | int? | 人数建议 / 上限 |
| is_paid / price_info | enum / jsonb? | free / fixed / pwyf |
| entry_requirements | text | 入场要求 |
| registration_questions | jsonb[] | |
| approval_required / waitlist_enabled | bool | |
| visibility | enum | public / members / private |
| tags | string[] | |
| status | enum | 见状态机 |
| host_id / co_host_ids | uuid[] | |
| created_via | enum | web / agent / telegram(v2) |
| checkin_mode | enum | qr_rotating / qr_static / none;**默认 qr_rotating** |
| checkin_claim_cap | int? | NFT 领取数字上限(V2 生效) |
| sync_state | jsonb | {"luma":{...},"social_layer":{...}} |

**Registration 报名**

| 字段 | 说明 |
| --- | --- |
| id / event_id / member_id | |
| status | pending / approved / waitlist / declined / canceled |
| answers | 表单答案 |
| checked_in_at | 签到时间 |
| source | web / agent / telegram |

**CheckinToken 签到令牌(CAS 签发)**

| 字段 | 说明 |
| --- | --- |
| id / event_id / registration_id | |
| claim_url | 一次性领取网址(活动 URL + 签名,由 CAS 生成) |
| token_hash | 签名哈希(防重放) |
| expires_at / consumed_at | 过期 / 消费时间 |
| nft_claim_id | V2:外部 NFT 系统领取记录 |

说明:主持人端二维码按"扫一次变一次"轮换(每次扫描后旧码作废、生成新码);参与者扫码获得一次性 claim_url,由 CAS 校验签名并登记;领取数量受 checkin_claim_cap 限制。一期实现轮换二维码 + 一次性 URL + 人数上限;NFT 签发为 V2(见 07)。

### 2.3 预订域(Booking)

**Booking 预订**

| 字段 | 说明 |
| --- | --- |
| id / venue_id / event_id? | 关联活动(随活动预订)或独立 |
| member_id / purpose | |
| start_at / end_at | 含缓冲的占用区间 |
| attendees_count | |
| status | pending / approved / rejected / canceled / checked_in / completed / no_show |
| rule_version | 结算依据 |
| points_charged | **默认 0**;接口预留 |
| deposit_points | 预留,默认 0 |
| approved_by / decision_note | |

### 2.4 成员域(People,身份镜像自 CAS)

**Member 成员(本地档案)**

| 字段 | 说明 |
| --- | --- |
| id | 本地 ID |
| cas_user_id | **CAS 账户 ID(身份权威)** |
| email | 镜像(CAS 权威) |
| cas_verified | CAS 邮箱验证状态(镜像) |
| display_name / avatar_url / bio / timezone | 镜像 |
| telegram_id / telegram_username | 镜像(经 CAS 绑定) |
| tier | 本地会员等级(决定预订权限;积分等级在 CAS) |
| status | active / suspended |
| roles | [{"scope":"venue:*","role":"venue_manager"}] |

**PointsMirror 积分镜像(只读)**

| 字段 | 说明 |
| --- | --- |
| member_id / balance / updated_at | 定时从 CAS 同步 |
| last_synced_ledger_id | 增量同步游标 |

**PointsLedgerLocal 本地流水镜像(只读,审计辅助)**

| 字段 | 说明 |
| --- | --- |
| id / member_id / delta / reason / ref_type / ref_id / created_at | reason: booking_charge / quota_grant / host_reward / attend_reward / manual_adjust / expire ... |

原则:任何积分写操作(发放/扣减)都调用 CAS 接口完成,本地只落镜像;禁止本地直接改余额。

### 2.5 通知与集成

**NotificationOutbox 通知 outbox(供 4seasbot 拉取)**

| 字段 | 说明 |
| --- | --- |
| id / member_id? / target | chat_id 或 telegram_id(经 CAS 绑定解析) |
| channel | telegram / email |
| template / payload | 模板与变量 |
| scheduled_at / status | scheduled / pending / delivered / failed |
| retry_count / last_error | |

**SyncRecord 外发同步(单向发布)**

| 字段 | 说明 |
| --- | --- |
| id / entity_type / entity_id | event / venue |
| platform | luma / social_layer |
| external_id / external_url | |
| status | pending / syncing / synced / failed / dead_letter / canceled |
| last_error / synced_at | |

**AuditLog 审计**:所有写操作(人/Agent/key)、action、before/after diff、时间。Agent 操作记录 draft_id 与 confirm 人。

---

## 3. 状态机

### 3.1 Event 活动

                    +--------------+
                    |    draft     | <---- 创建(web / agent;telegram v2)
                    +------+-------+
                           | 预览确认
                           v
                    +--------------+  拒绝   +--------+
                    | pending_review+------->| draft  |
                    +------+-------+        +--------+
                           | 通过(或 auto 模式)
                           v
                    +--------------+  取消   +-----------+
                    |  published   +------->| canceled  |
                    +------+-------+        +-----------+
                           | 到开始时间         v
                           v              释放场地/通知/同步取消
                    +--------------+
                    |   ongoing    |
                    +------+-------+
                           | 到结束时间
                           v
                    +--------------+
                    |    ended     |
                    +------+-------+
                           | T+7 天
                           v
                    +--------------+
                    |  archived    |
                    +--------------+

- published 触发:单向同步 Luma + Social Layer;通知 outbox 写入。
- 改期:重新校验场地占用 + 通知报名者,状态不变。
- 取消:通知、释放场地、同步取消到外部平台(Luma 两步 token;Social Layer DELETE 软取消)。

### 3.2 Booking 预订

    pending --approve--> approved --check-in--> checked_in --结束--> completed
       |
       +--reject--> rejected(终态)
       +--cancel --> canceled
    approved 超时未签到 -> no_show

### 3.3 Member

    CAS registered(unverified) --CAS 验证--> verified(member) --本地授权--> venue_manager / admin

### 3.4 SyncRecord

    pending -> syncing -> synced <-> failed(重试 N 次 -> dead_letter,人工介入)
    synced --(源对象更新)--> outdated -> 重新 syncing

---

## 4. 关键规则与约束

### 4.1 场地可用性

    is_available(venue, start, end):
      if venue.status != open: false
      if not within_opening_hours(venue, start, end): false
      if date in venue.blackout_dates: false
      for b in active_bookings(venue, [start - buffer, end + buffer]):
          if overlaps(b, start, end): false
      return true

### 4.2 冲突检测

- 占用区间含缓冲;数据库 exclusion constraint(tstzrange + btree_gist)保证原子性。
- 同成员同时段多预订:软警告。

### 4.3 积分(预留,默认关闭)

- points_per_hour 默认 0;扣减代码路径实现但由 feature flag 控制。
- 开启后:approved 时经 CAS 冻结/扣减;completed 结算;canceled 按政策退还。
- 本地镜像表只用于展示与审计,权威在 CAS/链上。

### 4.4 容量与签到

- 报名上限 = min(event.max_capacity, venue.capacity)。
- 签到领取总数 ≤ checkin_claim_cap(设置时);claim_url 一次性,消费后作废。

### 4.5 审计

所有写操作记录 actor(人/Agent/key)、action、diff、ip/ua、时间。

---

## 5. 与外部系统的数据边界

| 数据 | 权威源 | 本系统 |
| --- | --- | --- |
| 账户/邮箱/验证状态 | **CAS** | 镜像(cas_user_id, cas_verified) |
| 积分余额/流水 | **CAS + 链上(V2)** | 只读镜像 |
| Telegram 绑定 | **CAS** | 镜像(用于通知路由) |
| 签到令牌/领取记录 | **CAS** | 发起扫码、回写结果 |
| 活动基础信息 | CommunityOS | 权威 |
| 报名(站内) | CommunityOS | 权威 |
| 外部平台活动 | CommunityOS -> 单向发布 | SyncRecord 映射 |

原则:**核心实体不依赖外部 ID;外部 ID 只存于 SyncRecord;身份不离开 CAS。**

---

## 6. API 草图(内部 REST,节选)

    POST   /auth/cas/callback           # CAS 登录回调(换本系统会话)
    GET    /me                          # 当前用户(含积分镜像)
    GET    /venues /venues/{id}
    GET    /venues/{id}/availability?from=&to=
    POST   /venues                      # [venue_manager]
    PATCH  /venues/{id}
    PUT    /venues/{id}/rules
    POST   /events                      # 创建(快速/完整)
    GET    /events?view=day|week|list|map
    GET    /events/{id}
    POST   /events/{id}/publish         # 触发单向同步 + 通知
    POST   /events/{id}/cancel
    POST   /events/{id}/registrations   # 报名
    POST   /events/{id}/check-in/rotate # 主持人端:轮换签到二维码
    POST   /events/{id}/check-in/claim  # 参与者端:消费一次性领取网址
    POST   /bookings                    # 独立预订
    POST   /bookings/{id}/approve|reject|cancel
    GET    /bookings?venue=&from=&to=   # 占用总览
    GET    /me/points                   # 积分镜像
    GET    /schedule.ics                # iCal 订阅

    # 4seasbot 出站 feed(见 04)
    GET    /v1/integrations/bot/events?from=&to=
    GET    /v1/integrations/bot/notifications?since=
    POST   /v1/integrations/bot/notifications/{id}/ack

Agent 专用端点与 MCP 工具清单见 04-integrations.md;CAS 接口契约见 06-community-account-system.md。
