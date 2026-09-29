# 4Seas CommunityOS 文档

> Organize the Place, Event, and People for Community.
> 运营于物理世界的在地社区操作系统。

本目录包含 4Seas CommunityOS 的调研分析与产品规划文档,按阅读顺序排列:

| 文档 | 内容 | 适合读者 |
| --- | --- | --- |
| [01-research-benchmark.md](01-research-benchmark.md) | 调研报告:Luma、Social Layer、Zuzalu.city、场地/空间管理系统(Cobot 等)、Telegram Bot & Mini App、Agent API/MCP、706 社区等先例的深度分析,以及横向对比与关键结论 | 全体 |
| [02-product-plan.md](02-product-plan.md) | 产品规划(v2):定位与系统边界(CAS/4seasbot/单向发布)、用户角色、信息架构、功能架构、核心用户旅程、MoSCoW 优先级、关键设计决策 | 产品/设计/全员 |
| [03-domain-model.md](03-domain-model.md) | 领域与数据模型(v2):实体模型(建筑-楼层-场地、活动、预订、成员、积分镜像、签到令牌、通知 outbox)、状态机、规则引擎、核心约束、API 草图 | 产品/后端 |
| [04-integrations.md](04-integrations.md) | 集成架构(v2):Luma 单向发布(字段映射/限流/对账)、Social Layer 单向发布(实测 API + computer-use 兜底)、Telegram 通知经 4seasbot(拉取式)、Agent API(REST + MCP draft+confirm) | 后端/集成 |
| [05-roadmap.md](05-roadmap.md) | 路线图(v2):M0-M2 阶段与验收标准、V2 远期(链上积分/NFT/Mini App)、风险、开放问题 | 全员/管理层 |
| [10-gap-analysis.md](10-gap-analysis.md) | **交付差距分析**:运营后台缺口清单与补齐进度(含 D1 迁移决策记录) | 全员 |
| [11-handoff.md](11-handoff.md) | **交接说明**:环境与凭据、命令、架构数据流、**待办 2.3–2.6 逐项规格**、踩过的坑、文件地图 | **接手的 AI/工程师** |
| [09-luma-and-sola-access.md](09-luma-and-sola-access.md) | Luma 免订阅发布方案(浏览器自动化)与 Social Layer JWT 获取办法 | 运维/集成 |
| [08-deployment.md](08-deployment.md) | 部署:Cloudflare Pages + **D1** 绑定/迁移、构建发布流程、邮件与登录流程、上线验证清单 | 运维/全员 |
| [06-community-account-system.md](06-community-account-system.md) | **CAS 需求与接口规范**:账户/积分/签到/NFT 统一账户层的职责边界、OpenAPI 风格接口契约、对接清单、里程碑建议 | 后端/CAS 团队 |
| [07-future-onchain-nft.md](07-future-onchain-nft.md) | V2 规划记录:链上积分(签到/host/志愿者/speaker 赚取,兑换场地/咖啡/住宿)、NFT 签到(轮换二维码 + 一次性领取网址 + 数字上限) | 产品/全员 |

## 一句话概览

4Seas CommunityOS 是 4Seas 社区的"社区操作系统":管理多个自运营建筑中的**场地(Place)**,驱动**活动(Event)**的完整生命周期,服务**成员(People)**的注册、验证、预订与签到,并通过 Luma / Social Layer / 4seasbot / Agent API 对内降噪、对外分发。**邮箱注册与验证由本系统自己拥有**(docs/02 §1.2 v3);CAS 是链上扩展层(账户映射、积分权威、签到令牌、NFT 记录),本系统只做接口消费与镜像。

## 核心设计原则(源自调研)

1. **结构可编辑,而非硬编码**(借鉴 Social Layer):场地规则、预订策略、成员边界都是社区可协商、可迭代的配置层。
2. **降低发起门槛**(unconference 模式):任何经过验证的成员都能以最小信息(什么 / 何时 / 何地)发起活动。
3. **可见性即协调**:共享日程表 + 空间视图,让时间与空间的占用对所有人透明,减少审批与沟通成本。
4. **Agent 原生**:所有读写能力同时提供给人用的界面和给 Agent 用的 API/MCP,写操作一律走 draft + confirm。
5. **数据可携带**:成员与活动数据可导出,避免被单一 SaaS 锁定。
6. **身份分层**:邮箱身份(注册/验证/登录/会话)由本系统拥有;链上账户、积分、签到/NFT 归 CAS 与链上,数据库只镜像其权威结果。