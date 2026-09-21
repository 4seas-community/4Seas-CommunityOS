# 4Seas CommunityOS 文档

> Organize the Place, Event, and People for Community.
> 运营于物理世界的在地社区操作系统。

本目录包含 4Seas CommunityOS 的调研分析与产品规划文档,按阅读顺序排列:

| 文档 | 内容 | 适合读者 |
| --- | --- | --- |
| [01-research-benchmark.md](01-research-benchmark.md) | 调研报告:Luma、Social Layer、Zuzalu.city、场地/空间管理系统(Cobot 等)、Telegram Bot & Mini App、Agent API/MCP、706 社区等先例的深度分析,以及横向对比与关键结论 | 全体 |
| [02-product-plan.md](02-product-plan.md) | 产品规划:产品定位、用户角色、信息架构、功能架构、核心用户旅程、MVP 范围与关键设计决策 | 产品/设计/全员 |
| [03-domain-model.md](03-domain-model.md) | 领域与数据模型:实体模型(建筑-楼层-场地、活动、预订、成员、积分)、状态机、规则引擎、积分账本、核心约束 | 产品/后端 |
| [04-integrations.md](04-integrations.md) | 集成架构:Luma 双向同步(字段映射/webhook/失败处理)、Social Layer 同步方案、Telegram Bot & Mini App、Agent API(REST + MCP)、通知矩阵、邮件基础设施 | 后端/集成 |
| [05-roadmap.md](05-roadmap.md) | 路线图:M0-M3 阶段划分、验收标准、成功指标、风险与缓解、待决策的开放问题 | 全员/管理层 |

## 一句话概览

4Seas CommunityOS 是 4Seas 社区的"社区操作系统":管理多个自运营建筑中的**场地(Place)**,驱动**活动(Event)**的完整生命周期,服务**成员(People)**的注册、验证、预订与积分,并通过 Luma / Social Layer / Telegram Bot / Agent API 对内降噪、对外分发。

## 核心设计原则(源自调研)

1. **结构可编辑,而非硬编码**(借鉴 Social Layer):场地规则、预订策略、成员边界都是社区可协商、可迭代的配置层。
2. **降低发起门槛**(unconference 模式):任何经过验证的成员都能以最小信息(什么 / 何时 / 何地)发起活动。
3. **可见性即协调**:共享日程表 + 空间视图,让时间与空间的占用对所有人透明,减少审批与沟通成本。
4. **Agent 原生**:所有读写能力同时提供给人用的界面和给 Agent 用的 API/MCP,写操作一律走 draft + confirm。
5. **数据可携带**:成员与活动数据可导出,避免被单一 SaaS 锁定。
