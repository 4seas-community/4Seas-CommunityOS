# 01 · 调研报告:先例分析与竞品调研

> 调研时间:2026-09 · 方法:公开资料 + 官方文档 + 学术论文 + 产品实测页面
> 目的:为 4Seas CommunityOS(Place / Event / People)的产品规划提供依据,避免重复造轮子,并明确差异化空间。

---

## 0. 结论先行(TL;DR)

1. **事件平台层已经成熟且 API 化**:Luma 提供了完整的公开 REST API(事件 CRUD、嘉宾管理、票务、优惠券、邮件群发、Webhook),可以作为 4Seas 活动的"对外公开页 + 注册收款 + 提醒邮件"通道。我们自建系统作为主数据源做**单向发布 + 有限回写**即可,无需自建票务。
2. **社区型(unconference)活动系统的最佳先例是 Social Layer**:它出身于 706 社区,服务于 Zuzalu 系 pop-up city(4Seas 当前正使用它,见 sola.day 上的 "4Seas Community")。其核心设计——Programs/Venues 元数据、可编辑的场地规则、轻量 RSVP、边界模块(徽章/邀请/审批)、共享日程与地图、可携带数据——与 4Seas 的需求高度重合,应作为产品设计的直接参照,而不是从零发明。
3. **场地管理(空间运营)的成熟先例在 coworking SaaS**:Cobot 的"预订额度(Buchungsguthaben)"模式(按会员等级每月发放时长额度或货币额度,按资源消耗)验证了"积分/额度消耗场地"的产品化路径;开源侧的 MRBS 提供了时间槽预订与冲突管理的最小完整参考。
4. **Telegram 是最适合 4Seas(清迈/海外数字游民社区)的即时通道**:Bot + Mini App 可同时覆盖"创建活动、报名、审批、签到、每日日程推送",且有官方比赛获奖项目 TeleVenue(场地预订 Mini App)作为架构先例。
5. **Agent API 已有成熟范式**:luma-mcp 的"读直接调用、写走 draft + confirm、审计日志、prompt 注入清洗、零 LLM 决策"应作为我们 Agent API 的安全基线。
6. **我们的差异化空间**:Luma 不懂"我们的建筑、楼层、场地、额度与规则";Social Layer 不做场地运营与积分账本;Cobot 面向 coworking 商业空间,没有活动生命周期与多渠道分发。**4Seas CommunityOS 的独特定位 = 物理空间运营(Place)+ 活动生命周期(Event)+ 成员/积分(People)的三位一体,并且 Agent 原生。**

---

## 1. Luma(lu.ma)— 事件平台标杆

### 1.1 产品定位

Luma 是当前 Web3/科技社区最主流的轻量活动平台:以"日历(Calendar)"为单位组织活动,支持个人/团队日历、公开发现(Discover)、报名审批、票务收款(Stripe)、邮件通知与提醒、Zoom/Meet 集成。

### 1.2 事件基础信息(创建流程)

来源:Luma Help Center《Creating an Event》与 API 文档。

- 标题、开始/结束时间、时区(多日活动)
- 类型:线下(In-Person)/ 线上(Online)/ 混合(Hybrid)
- 地点:场地名或地址,落地地图;线上则填会议链接(可为每位嘉宾生成唯一 join link)
- 封面图:官方图库或上传
- 描述:富文本(Markdown)
- 主题与配色(40+ 主题)
- 归属日历:个人日历 / 团队日历 / 新建日历
- 可见性:Public(公开、可被搜索引擎索引)/ Private(仅链接)/ Members-only(仅日历成员)
- 报名设置:是否开放注册、报名表单问题(registration questions)、是否需要审批(pending approval)、等待名单(waitlist)、容量上限(max capacity)、是否显示嘉宾名单
- 票务:免费默认票;付费票需日历绑定 Stripe;支持 pay-what-you-want;优惠券
- 通知:确认邮件自定义、待审批邮件、拒绝邮件、会前提醒(可关闭)、会后反馈邮件

### 1.3 API 能力全景(关键)

来源:docs.luma.com(OpenAPI,llms.txt 索引)。

- **事件**:create / update / get;取消为两步流程(先取 15 分钟有效的 cancellation token,再执行;不可逆,自动通知全部嘉宾并处理退款)
- **嘉宾**:add / get / list / update-status(approved / declined / pending_approval / waitlist,支持退款)/ update-tickets / send-invites(邮件 + 短信)
- **主办人(hosts)**:add / update / remove,支持 check-in staff 与 manager 两级权限
- **票务与优惠券**:ticket types CRUD、event 级与 calendar 级 coupons
- **日历**:events add / approve / reject(**社区日历的投稿-审批流**)、contacts 导入/拉黑/恢复、contact tags、event tags、calendar 更新
- **会员**:membership tiers 列表、members add / update-status
- **邮件群发(blasts)**:create / update / delete / list / get——给报名者批量发邮件
- **Webhook 事件**:event.created / event.updated / event.canceled、guest.registered / guest.updated / guest.refunded、ticket.registered、calendar.event.added / calendar.event.submitted、calendar.person.subscribed / unsubscribed
- **图片**:create-upload-url 上传到 Luma CDN 后引用(封面 URL 必须指向 images.lumacdn.com)
- **地点**:places search(Google Maps)
- **认证与限流**:x-luma-api-key 请求头;Calendar key 200 次/分钟,Organization key 500 次/分钟,超限返回 429
- **门槛**:公开 API 需要 Luma Plus 订阅(luma-mcp README 明确说明)

### 1.4 对 4Seas 的启示

| 观察 | 对我们的决策 |
| --- | --- |
| Luma 的字段体系覆盖了活动公开信息的 90% | 我们的事件模型直接对齐 Luma 字段,保证同步零信息损失 |
| Luma 有审批(waitlist/approval)、嘉宾名单、容量 | 这些属于"活动维度",与我们"场地维度"的审批是两层,需明确分工 |
| Luma API 有取消两步 token、限流、封面需先上传 CDN | 同步器必须处理这些约束:预上传封面、限流退避、取消走确认流 |
| Luma webhooks 覆盖报名/取消/退款 | 可以回写报名数据,形成双向闭环 |
| Luma Plus 付费墙 | 需要确认 4Seas 的 Luma 订阅等级;若未订阅,自动同步方案降级为"人工确认 + 半自动" |
| Luma 不理解"我们的建筑-楼层-场地-额度" | 这是我们必须自建的核心,不能外包给 Luma |

---

## 2. Social Layer(sola.day)— 社区活动基础设施的最佳先例

### 2.1 它是什么

Social Layer 是出身于 706 社区的开源、去中心化"社交层"协议与产品,定位为 pop-up city / 临时性意向社区的**模块化社会基础设施**(modular online infrastructure for serendipitous co-living)。官网 sociallayer.im,应用在 app.sola.day。**4Seas Community 当前正使用它发布活动**(sola.day/event/4seas),场地命名如 "Zuzalu Library Event Space - 1st Floor, Building F"、"4Seas Nimman 1st floor Coworking space"——这与我们要做的"建筑-楼层-场地"模型完全同构,说明该模型已被真实运营验证。

### 2.2 学术论文中的系统设计(arXiv 2511.15680,2026)

论文《Infrastructuring Pop-Up Cities with "Social Layer"》完整记录了其设计与 5 个真实部署(山海互 Shanhaiwoo 2023、muChiangmai 2023、Edge Esmeralda 2024、Aleph 2024、Gathering of Tribe 2024):

**设计原则**

- **身份与信任(Identity and Trust)**:隐私保护凭证 + 轻量验证提示;支持**可配置边界模块**——邀请制 token、钱包参与证明、同伴审批、开放注册,社区自定义"多开放"。
- **Unconference 式活动发起**:活动创建被视为"发起邀请"而非"行政管理";最小输入即 what / where / when;支持动态改期与**共享空间占用冲突检测**;**规则(如预订政策)是社区可编辑的层,而非 SaaS 硬编码**。
- **RSVP 与在场线索**:轻量 RSVP(可标记"感兴趣"而不承诺)、可选二维码签到、"谁与我有共同话题"提示;通过"社会透明度"平衡协调与偶遇。
- **记忆与来世(Memory and After-life)**:活动历史、照片、参与痕迹构成可携带的社区记忆,跨届迁移。

**架构**

- **运营者仪表盘**:全局设置(时区、可见性、谁能创建/加入/查看);Programs(主题 residency)与 Venues 分组,场地含位置、描述、容量、设施、可用时段、开放时间等可编辑元数据,可限定仅某 Program 可用或全局开放;角色权限(组织者/成员/参与者,同一用户在不同社区角色不同);数据可导出。
- **参与者界面**:突出的"创建活动"按钮;统一日程表(紧凑/列表/按场地/周视图,可视化时间重叠);按标签/场地/Program 过滤;地图视图(活动地理定位);徽章与票(免费/付费,资格徽章控制访问)。

**部署数据**:5 个社区共 1586 场活动,其中 69.7% 是社区开始后成员自发组织(Edge Esmeralda 580 人规模下仍成立)。同时论文指出规模化的张力:活动过多导致选择疲劳,需要"每日精选(digest)"等轻量策展机制。

### 2.3 对 4Seas 的启示

| Social Layer 的做法 | 4Seas CommunityOS 的对应决策 |
| --- | --- |
| Venue 元数据(容量/设施/可用时段) | 场地模型的字段基线;增加 4Seas 特有的:面积、设备清单、基础服务、容纳上限、有效时间 |
| 规则是可编辑层 | 场地规则引擎:允许活动类型、申请流程、积分价格、禁止行为——全部配置化、可版本化 |
| 最小创建(what/where/when)+ 可选模块 | 活动创建分"快速创建"与"完整创建"两档,降低发起门槛 |
| 轻量 RSVP + 可选 QR 签到 | 报名 + 到场签到,签到数据反哺积分 |
| 69.7% 自发活动 | 把"自发活动占比"设为核心北极星指标之一 |
| 每日 digest | 每日日程推送(邮件/Telegram)作为 V1 功能 |
| 邮箱即可用、徽章为参与凭证 | 成员体系:邮箱注册 + 验证;徽章/成就作为 V2 增强 |

**注意**:Social Layer 是通用协议型产品,不做场地运营(额度、收费、工单)、不做审批工作流、不做通知矩阵,这些正是 4Seas 要补的。

**API 实况补充(2026-09 调研)**:Social Layer 无公开 API 文档,但其前端开源仓库 sociallayer-im/seastar-app 的 packages/sola-sdk 揭示了完整的 api.sola.day/api/v1 契约,且 4Seas-bot 已在生产使用其只读端点。实测确认存在**可写端点**:POST /events(创建,内联 roles/tickets)、PATCH /events/:id、DELETE /events/:id(软取消)、POST /events/:id/approve、POST /events/:id/participants/check_in、POST /venues(/availability、/conflict)等;认证支持邮箱验证码、手机验证码、Google OAuth、SIWE 钱包登录(JWT)。**结论:Social Layer 单向发布可基于服务账号 JWT 直接调 API 实现**(详见 04-integrations.md 第 3 节),无需 computer use(仅作兜底)。

---

## 3. Zuzalu.city — "Community OS"概念的完整定义

Zuzalu.city 自称"去中心化开源的社区操作系统(Community OS / C-OS)",提出 OS 式框架:用户界面层、数据存储管理(社区数据选择性共享)、安全与权限、兼容与互操作、更新与维护;配套 dapp store,社区按需安装事件、通信、治理等模块。其事件模块从 ZK 门控的无许可排期演进到多种票务选项。

**启示**:我们的信息架构可以采用"社区空间(Space)+ 可安装模块"的心智模型,但以**单社区、自托管、务实**的方式实现:核心模块(Place/Event/People/积分)内置,集成(Luma/Social Layer/Telegram/Agent)以"连接器"形式提供,避免过度平台化。其"数据可携带、可 fork"的理念应保留为数据导出能力。

---

## 4. 场地 / 空间管理系统(coworking 先例)

### 4.1 Cobot(德国,coworking 空间管理 SaaS)

- **预订额度(Buchungsguthaben)**:会员按套餐每月获得免费时长额度(小时数)或货币额度(如 50 欧元/月),用于资源预订;额度可按套餐、甚至按会员个体配置;额度可限定用于单个资源或多个资源。
- 意义:**验证了"积分/额度消耗场地"这一产品模式**:会员 tier → 周期额度 → 按资源扣减。我们的积分系统直接借鉴该模型,并增加"活动预订自动走同一账本"。
- 另有"预订通行证(Prepaid Buchungspässe)"等次卡模式,可作为积分包的参考。

### 4.2 Skedda / OfficeRnD 等(商业空间管理)

共同能力:资源(房间/工位)管理、时段定价、审批、冲突预防、缓冲时间(setup/teardown)、访客管理、发票。共同教训:**规则多为硬编码**,定制成本高——这正是 Social Layer 论文批评的,也是我们把"规则引擎"作为一等公民的机会。

### 4.3 开源参考:MRBS

MRBS(Meeting Room Booking System)是最经典的开源会议室预订系统:房间/区域管理、时段槽、重复预订规则、权限控制。适合作为"预订"模块最小可用性的参照(不需要重复其全部功能,但其"区域-房间-时段"三层结构值得参考)。

### 4.4 对 4Seas 的启示

- 实体层级:**Building → Floor → Venue(Room/Space)**,与 4Seas 现状(Building F、1st Floor、Event Space / Library / Coworking)一致。
- 预订要素:时间段 + 缓冲时间 + 容量上限 + 冲突检测 + 审批状态机 + 取消政策。
- 额度要素:会员 tier → 月度额度 → 按场地单价扣减 → 账本流水。

---

## 5. Telegram Bot & Mini App — 社区运营的即时通道

### 5.1 平台能力(Bot API + Mini Apps)

- Bot:命令、回调按钮、内联模式、群组集成、支付(第三方 provider,含 Google Pay / Apple Pay)、可向用户推送消息。
- Mini App:在 Telegram 内运行的 Web App,**无缝授权**(initData 签名验证,无需额外登录)、全屏模式、主屏快捷方式、本地安全存储。等于"零安装的小程序",对海外社区(清迈场景)触达极佳。

### 5.2 先例:TeleVenue

Telegram 官方 Mini App 大赛第三名项目:Bot + Mini App 完成"浏览场地 → 填写信息 → 预订"完整流程;技术栈 FastAPI + aiogram + React。**架构可直接借鉴**:Bot 负责交互与通知,Mini App 负责复杂表单(创建活动/预订),后端共用同一套 REST API。

### 5.3 对 4Seas 的启示

- 创建活动:Bot 对话式引导(what/when/where 最小集),复杂字段走 Mini App 表单。
- 预订审批:场地管理员在 Bot 内一键批准/拒绝。
- 提醒与每日日程:Bot 推送(打开率显著高于邮件)。
- 身份:Bot 不做独立账户体系,Telegram 账号绑定到 CommunityOS 成员(initData 验证),邮箱仍是唯一身份主键。

---

## 6. Agent API / MCP — 让 Agent 成为社区的一等公民

### 6.1 先例:luma-mcp(lu.ma 的 MCP server)

设计要点(README,14 个工具):

- **读操作直接调用**:health、get_event、list_events、list_event_guests、list_coupons。
- **写操作一律 draft + confirm 两段式**:create_event_draft 返回 draft_id,confirm 后才真正写入;草稿 1 小时过期、只能确认一次;cancel_draft 幂等。
- **审计**:JSONL 审计日志(时间、工具、动作、脱敏参数、状态、延迟)。
- **脱敏**:api_key / token / cookie / secret 等字段日志前掩码。
- **Prompt 注入清洗**:用户自由文本做 NFKC 归一化、去零宽字符、包裹角色伪装前缀。
- **零 LLM 决策**:工具路由全部规则化。

### 6.2 对 4Seas 的启示

Agent API 设计基线(详见 04-integrations.md):

1. 双轨:REST(OpenAPI 3.1)+ MCP server,同一后端、同一权限模型。
2. 读开放、写审批:查询类工具直接执行;创建/修改类走 draft + confirm,由人类(或策略)确认。
3. Agent 身份独立:每个 Agent 独立 API key、scope 最小化、全量审计、限流。
4. 所有 Agent 行为对人可见(审计界面),社区可随时吊销 key。

---

## 7. 706 社区 — 中国物理社区运营先例

706 青年空间是中国最具代表性的青年共居/共学社区实体,其运营方式(论坛 706.town 治理提案、城市客厅空间活化、Social Layer 出身)说明:**物理社区 = 空间 + 内容活动 + 成员自治**的复合体,纯工具无法覆盖治理与关系,但工具必须支撑"低门槛发起、透明占用、可携带身份与记忆"。4Seas 作为海外华人/数字游民向社区,可同时吸收 706(中文社区治理)与 Zuzalu 系(国际 pop-up city)两套经验。

---

## 8. 横向对比总表

| 维度 | Luma | Social Layer | Zuzalu.city | Cobot/Skedda | 4Seas CommunityOS(规划) |
| --- | --- | --- | --- | --- | --- |
| 场地/空间管理 | 无(仅地点字段) | Venue 元数据 + 可用时段 | 依赖 dapp | 核心(房间/工位/定价) | **核心:建筑-楼层-场地 + 规则引擎** |
| 活动生命周期 | 完整(含票务收款) | 轻量创建 + RSVP | 模块化 | 无 | 完整(草稿→预览→审批→发布→归档) |
| 成员体系 | 日历订阅者 | 身份/徽章/边界模块 | ZK 身份 | 会员套餐 | 邮箱注册验证 + 角色 + 积分账本 |
| 预订/额度 | 无 | 有冲突检测,无额度 | 无 | 额度/次卡/发票 | 独立预订 + 随活动预订 + 积分消耗 |
| 通知 | 邮件(强) | 站内 | 依赖模块 | 邮件 | 邮件 + Telegram +(未来 IM) |
| 对外分发 | 自身即公开页 | sola.day 发现页 | dapp store | 无 | **同步 Luma + Social Layer** |
| Agent API | 官方 REST + 社区 MCP | 有限 | 链上交互 | 部分 | **REST + MCP,draft+confirm** |
| 数据可携带 | 受限 | 强调 | 强调 | 受限 | 全量导出 |

---

## 9. 对产品规划的关键输入(决策清单)

1. **主数据源在我们,Luma/Social Layer 是分发镜像**——避免双写不一致,冲突以我方为准(回写有明确边界)。
2. **活动字段集对齐 Luma create event API**,同步映射零损失(见 04 文档映射表)。
3. **场地规则引擎是一等公民**:允许活动类型、申请流程(自动/场地管理员/社区管理员)、积分定价、禁止行为、提前预订窗口、取消政策,全部配置化。
4. **积分 = 场地消耗货币**:借鉴 Cobot 额度模型,支持按会员等级月度发放 + 活动/签到赚取 + 预订消耗,全账本流水。
5. **Telegram 为一等通道**:Bot(命令/审批/提醒)+ Mini App(创建/预订表单),Telegram 账号绑定成员,不做独立账户。
6. **Agent API 安全基线**:draft+confirm、审计、脱敏、注入清洗、独立 key 与 scope、限流。
7. **北极星指标**:自发活动占比(对标 Social Layer 69.7%)、场地利用率、验证成员转化率、通知打开率。
8. **冷启动策略**:先迁移 4Seas 现有 sola.day 活动与场地数据作为种子(见 05-roadmap.md 开放问题)。

---

## 参考资料

- Luma API 文档:https://docs.luma.com/(Create Event、Webhooks、Rate Limits)
- Luma Help《Creating an Event》:https://help.luma.com/p/creating-an-event
- Social Layer 官网:https://www.sociallayer.im/ · 应用:https://app.sola.day/(4Seas Community 页面:https://app.sola.day/event/4seas)
- 论文:Infrastructuring Pop-Up Cities with "Social Layer"(arXiv:2511.15680)
- Zuzalu.city 文档:https://zuzalu.gitbook.io/zuzalu-beta-docs/(Community OS 定义、Dapp Store)
- Cobot 帮助中心《Buchungsguthaben》:https://helpcenter.cobot.me/de/articles/4991688
- MRBS:https://mrbs.sourceforge.io/
- Telegram Mini Apps:https://core.telegram.org/bots/webapps
- TeleVenue(Telegram 场地预订 Mini App):https://github.com/NickNaskida/TeleVenue
- luma-mcp:https://github.com/adelaidasofia/luma-mcp
- 706 社区:https://706.town/
