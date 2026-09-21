# 03 · 领域与数据模型

> 本文档定义 4Seas CommunityOS 的核心领域模型、实体字段、状态机与关键约束,作为数据库设计与 API 实现的依据。

---

## 1. 领域全景

    Community(社区)
     |-- Building(建筑) --> Floor(楼层) --> Venue(场地) --> VenueRule(规则,版本化)
     |                                              |
     |-- Program(主题program)                        |
     |                                              v
     |-- Member(成员) --> PointsAccount(积分账户) --> PointsLedger(积分流水)
     |      |                                          ^
     |      |-- Booking(预订) -------------------------| 扣减/退还
     |      |      ^                                    |
     |      +-- Event(活动) --> Registration(报名)      | 奖励
     |             |                                    |
     |             +-- SyncRecord(外发同步记录: Luma / Social Layer)
     |
     +-- Notification(通知) / AuditLog(审计)

核心不变式(Invariants):

1. 一个场地在同一时间段(含缓冲)最多有一个 active 预订。
2. 活动的报名人数不得超过活动容量与场地容量上限的较小值。
3. 积分余额不得为负(扣减前校验;押金冻结单独计算)。
4. 只有 verified 成员可以发起活动或预订场地。
5. 外部平台(Luma/Social Layer)的活动 ID 只存在于 SyncRecord,不进入核心实体。

---

## 2. 实体定义

### 2.1 空间域(Space)

**Building 建筑**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| community_id | uuid | |
| name | string | 如 "Building F"、"4Seas Nimman" |
| address | string | 物理地址 |
| geo | point | 经纬度(地图/导航) |
| status | enum | active / maintenance / closed |
| cover_image | url | |
| description | text | |

**Floor 楼层**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| building_id | uuid | |
| name | string | 如 "1st Floor" |
| sort_order | int | 排序 |
| map_asset | url | 楼层平面图(可选) |

**Venue 场地(房间/空间)**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| building_id / floor_id | uuid | 归属 |
| name | string | 如 "Event Space"、"Zuzalu Library Event Space" |
| code | string | 场地编号(如 F1-EVENT) |
| area_sqm | decimal | 面积(平方米) |
| capacity_seated / capacity_standing | int | 容纳人数上限(两种口径) |
| amenities | string[] | 设备清单:projector, sound_system, whiteboard, tables, chairs, kitchen, wifi, parking, ac |
| services | string[] | 基础服务:cleaning, security, drinks, storage |
| opening_hours | jsonb | 按星期的开放时段,如 [{"dow":1,"open":"09:00","close":"21:00"}] |
| blackout_dates | date[] | 例外关闭日期 |
| photos | url[] | |
| status | enum | open / maintenance / closed |
| default_buffer_min | int | 默认布置+撤场缓冲(分钟) |

**VenueRule 场地规则(版本化)**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid | |
| version | int | 规则版本;变更不影响已确认预订 |
| allowed_event_types | string[] | 允许的活动类型白名单 |
| approval_mode | enum | auto / venue_manager / community_admin |
| points_per_hour | int | 每小时积分价 |
| member_tier_discount | jsonb | 按会员等级折扣率 |
| free_quota_applies | bool | 是否适用会员月度免费额度 |
| deposit_points | int | 押金(可退) |
| max_advance_days | int | 最多提前 N 天 |
| min_advance_hours | int | 最短提前 N 小时 |
| max_duration_hours | int | 单次时长上限 |
| max_hours_per_month | int | 每月时长上限 |
| cancellation_policy | jsonb | {"free_before_hours":24,"late_cancel_fee_pct":50} |
| prohibited_behaviors | text[] | 禁止行为条款(报名/预订时须确认) |
| access_requirement | enum | verified_members / roles / public |

### 2.2 活动域(Event)

**Event 活动**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| community_id | uuid | |
| program_id | uuid? | 归属 Program(可选) |
| title | string | |
| description | text | 富文本/Markdown |
| start_at / end_at | timestamptz | 起止时间 |
| timezone | string | IANA,如 Asia/Bangkok |
| event_type | enum | in_person / online / hybrid |
| venue_id | uuid? | 自运营场地(空则为外部场地) |
| venue_snapshot | jsonb | 发布时场地信息快照(防场地改名/改价影响已发布活动) |
| external_location | string? | 外部场地名称/地址 |
| geo | point? | 地图坐标 |
| transport_info | text | 交通路线说明(公共交通/停车/步行) |
| meeting_url | string? | 线上会议链接 |
| banner_url | url? | 封面 |
| suggested_attendees | int? | 人数建议 |
| max_capacity | int? | 容量上限 |
| is_paid | enum | free / fixed / pwyw |
| price_info | jsonb? | {"amount":100,"currency":"THB"} |
| entry_requirements | text | 入场要求 |
| registration_questions | jsonb[] | 报名表单问题 |
| approval_required | bool | 报名是否需审批 |
| waitlist_enabled | bool | 候补 |
| visibility | enum | public / members / private |
| tags | string[] | |
| status | enum | 见状态机 |
| host_id | uuid | 发起人(Member) |
| co_host_ids | uuid[] | 联合发起人 |
| created_via | enum | web / telegram / agent(来源渠道,审计用) |
| sync_state | jsonb | {"luma":{...},"social_layer":{...}} |

**Registration 报名**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| event_id | uuid | |
| member_id | uuid | |
| status | enum | pending / approved / waitlist / declined / canceled |
| answers | jsonb | 报名表单答案 |
| checked_in_at | timestamptz? | 签到时间 |
| source | enum | web / luma_webhook / telegram / agent |

### 2.3 预订域(Booking)

**Booking 预订**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid | |
| event_id | uuid? | 关联活动(随活动预订);独立预订为空 |
| member_id | uuid | 申请人 |
| purpose | string | 用途(会议/讨论/排练...) |
| start_at / end_at | timestamptz | 含缓冲后的实际占用区间 |
| attendees_count | int | 人数 |
| status | enum | pending / approved / rejected / canceled / checked_in / completed / no_show |
| rule_version | int | 下单时适用的规则版本(结算依据) |
| points_charged | int | 实际扣减积分 |
| deposit_points | int | 押金(退还/罚没) |
| approved_by | uuid? | 审批人 |
| decision_note | text? | 审批备注 |

### 2.4 成员域(People)

**Member 成员**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | |
| email | string, unique | 身份主键 |
| email_verified_at | timestamptz? | 验证时间(null = unverified) |
| display_name / avatar_url / bio | | 资料 |
| telegram_id / telegram_username | string? | 绑定(initData 验证) |
| timezone | string | |
| tier | enum | guest / member / resident / steward(会员等级,决定额度) |
| status | enum | active / suspended |
| roles | jsonb[] | [{"scope":"venue:*","role":"venue_manager"}] |

**PointsAccount 积分账户**

| 字段 | 说明 |
| --- | --- |
| member_id | |
| balance | 可用余额 |
| frozen | 冻结中(押金、待结算) |
| monthly_quota_remaining | 本月免费额度剩余 |

**PointsLedger 积分流水(只追加)**

| 字段 | 说明 |
| --- | --- |
| id / member_id / delta | |
| reason | booking_charge / booking_refund / deposit_freeze / quota_grant / host_reward / attend_reward / manual_adjust / expire |
| ref_type / ref_id | 关联业务对象 |
| created_at | |

---

## 3. 状态机

### 3.1 Event 活动

                    +--------------+
                    |    draft     | <---- 创建(任何来源:web / telegram / agent)
                    +------+-------+
                           | 预览确认
                           v
                    +--------------+  拒绝   +--------+
                    | pending_review+------->| draft  | (退回修改)
                    +------+-------+        +--------+
                           | 通过(或 auto 模式直接通过)
                           v
                    +--------------+  取消   +-----------+
                    |  published   +------->| canceled  |
                    +------+-------+        +-----------+
                           | 到开始时间
                           v
                    +--------------+
                    |   ongoing    |
                    +------+-------+
                           | 到结束时间
                           v
                    +--------------+
                    |    ended     |
                    +------+-------+
                           | 自动归档(T+7 天)
                           v
                    +--------------+
                    |  archived    |
                    +--------------+

说明:

- 活动需要场地审批时进入 pending_review;auto 模式从 draft/preview 直接 published。
- published 后可改期:修改 start_at/end_at 触发"通知所有报名者 + 重新校验场地占用",状态不变。
- 取消为终态,触发:通知报名者、释放场地占用、按取消政策退积分、同步取消到 Luma(两步 token)。

### 3.2 Booking 预订

    pending --approve--> approved --check-in--> checked_in --结束--> completed
       |
       +--reject--> rejected(终态)
       +--(approved 后)cancel --按政策退/扣积分--> canceled
    approved 超时未签到 -> no_show(按政策扣)

### 3.3 Member 成员

    registered(unverified) --邮箱验证--> verified(member) --授权--> venue_manager / admin
                                            +-- 封禁 --> suspended

### 3.4 SyncRecord 外发同步

    pending -> syncing -> synced <-> failed(重试 N 次后进入 dead_letter,人工介入)
    synced --(源对象更新)--> outdated -> 重新 syncing

---

## 4. 关键规则与约束

### 4.1 场地可用性计算

    is_available(venue, start, end):
      if venue.status != open: false
      if not within_opening_hours(venue, start, end): false
      if date in venue.blackout_dates: false
      for b in active_bookings(venue, [start - buffer, end + buffer]):
          if overlaps(b, start, end): false   # 含缓冲的区间重叠
      return true

### 4.2 冲突检测

- 以"占用区间 = [start - buffer_before, end + buffer_after]"做区间重叠判断。
- 数据库层用 exclusion constraint(PostgreSQL 的 tstzrange + btree_gist)保证原子性,防止并发双订。
- 同一 member 同一时间段已有 approved 预订时,给出软警告(不阻断)。

### 4.3 积分结算

- 预订 approved 时:冻结 deposit(如有);points_charged = points_per_hour x hours x (1 - tier_discount),按 rule_version 计算;余额不足则拒绝。
- completed:正式扣减、退还押金。
- canceled(免费期内):全额退还;逾期:按 cancellation_policy 比例罚没,其余退还。
- no_show:押金罚没 + 记录信用事件。

### 4.4 容量校验

活动报名上限 = min(event.max_capacity, venue.capacity_standing 或 seated,按活动类型选择)。

### 4.5 审计

所有写操作(member、event、booking、points、rule、integration)记录审计日志:actor(人 / Agent / api key)、action、before/after diff、ip/ua、时间。Agent 操作额外记录 draft_id 与 confirm 人。

---

## 5. 与外部系统的数据边界

| 数据 | 主数据源 | 外部镜像 | 回写 |
| --- | --- | --- | --- |
| 活动基础信息 | CommunityOS | Luma event / Social Layer event | 无(外部修改不同步回来) |
| 报名/嘉宾 | CommunityOS(站内报名) | Luma guests | Luma webhook 回写报名/取消/退款 |
| 场地、规则、积分 | CommunityOS | 无 | 无 |
| 成员身份 | CommunityOS(邮箱) | Luma contacts(镜像邮箱) | 无 |

原则:**核心实体不依赖外部 ID;外部 ID 只存于 SyncRecord 映射表**,支持随时更换外部平台而不丢数据。

---

## 6. API 草图(内部 REST,节选)

    POST   /auth/register                # 邮箱注册
    POST   /auth/verify-email            # 验证 token
    POST   /auth/login                   # 发送登录 magic link
    GET    /venues                       # 场地列表(支持建筑/楼层/设备过滤)
    GET    /venues/{id}                  # 场地详情 + 规则 + 可用时段
    POST   /venues                       # [venue_manager] 创建
    PATCH  /venues/{id}                  # [venue_manager] 更新
    PUT    /venues/{id}/rules            # [venue_manager] 更新规则(新版本)
    GET    /venues/{id}/availability?from=&to=
    POST   /events                       # 创建(快速/完整)
    GET    /events?view=day|week|list|map&program=&venue=&tag=
    GET    /events/{id}
    POST   /events/{id}/publish          # 发布(触发同步 + 通知)
    POST   /events/{id}/cancel
    POST   /events/{id}/registrations    # 报名
    GET    /events/{id}/registrations    # [host] 嘉宾名单
    POST   /events/{id}/check-in         # [host] 扫码签到
    POST   /bookings                     # 独立预订
    POST   /bookings/{id}/approve|reject|cancel
    GET    /bookings?venue=&from=&to=    # 占用总览
    GET    /me/points/ledger
    POST   /admin/members/{id}/points    # [admin] 积分调整
    GET    /schedule.ics                 # iCal 订阅

Agent 专用端点与 MCP 工具清单见 04-integrations.md。
