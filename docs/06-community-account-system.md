# 06 · Community Account System(CAS)需求与接口规范

> 状态:需求草案 v1(2026-09)
> 面向仓库:git@github.com:4seas-community/Community-Account-System.git(开源)
> 本文档由 4Seas CommunityOS 项目提出,作为 CAS 的基础版本需求与接口契约。CAS 独立部署、独立演进;本系统(以及未来的 coliving / residency / booking 等)通过接口消费 CAS 能力。

---

## 1. 背景与定位

### 1.1 为什么需要 CAS

4Seas 生态有多个系统(活动/预订/共住/ residency 申请),每个系统都需要"人"与"人的资产"。如果每个系统自建账户,会导致:

- 身份碎片化:同一个成员在多套系统多份账户;
- 资产碎片化:积分、徽章、NFT、签到记录分散;
- 集成成本高:任何跨系统协作都要做账户映射。

**CAS 是 4Seas 生态的统一账户与资产层**:邮箱注册与验证、未来链上地址、积分账本(权威在链上)、活动签到(URL + 签名)、NFT 领取记录,全部沉淀在 CAS;业务系统只消费接口。

### 1.2 职责边界

| 能力 | CAS | 业务系统(如 CommunityOS) |
| --- | --- | --- |
| 邮箱注册/验证/登录/会话 | **负责**(发验证邮件、管 token、签 JWT) | 跳转/嵌入 CAS,校验 CAS 签发的 token |
| 用户资料 | 权威(昵称/头像/时区) | 镜像缓存 |
| Telegram 绑定 | 权威(initData 验签) | 读绑定状态用于通知路由 |
| 链上地址(V2) | 权威(SIWE 绑定) | 读取展示 |
| 积分账本 | **权威发放/扣减/流水**;V2 与链上同步 | 只读镜像;发起的扣减请求经 CAS 执行 |
| 活动签到 | **签发一次性领取网址(活动 URL + 签名)**、登记领取 | 生成轮换二维码、扫码入口、人数上限控制 |
| NFT 签发(V2) | 对接外部 NFT 系统,记录 claim | 不直接对接 NFT |
| 邮件发送(验证/通知) | 验证邮件必须;通知邮件可选 | 业务通知邮件自理 |

---

## 2. 基础版本范围(MVP of CAS)

本期实现:

1. **账户**:邮箱注册、验证邮件(一次性 token,24h)、登录(magic link 或验证码)、JWT 会话、登出。
2. **资料**:昵称、头像 URL、时区;读/改接口。
3. **Telegram 绑定**:提交 initData → 验签 → 绑定/解绑;提供绑定状态查询。
4. **API Key(服务间)**:业务系统(如 CommunityOS)持有 service key,用于服务端调用;支持 scope 与吊销。
5. **积分账本(数据模型 + 基础操作,默认不发放)**:账户、流水(append-only)、余额;提供发放/扣减/查询接口;**当前业务侧默认不启用积分扣减**,先把账本与接口跑通。
6. **签到令牌**:为一次报名签发"一次性领取网址"(活动 URL + HMAC 签名,含 event_id、registration_id、exp、nonce);提供校验与消费接口(消费后作废,返回领取结果)。
7. **NFT claim 记录(V2 预留)**:数据表与接口先占位,不实现链上逻辑。

明确不做(后续版本):链上积分发放与同步、SIWE 钱包绑定正式开放、OAuth 第三方登录、多租户组织架构、管理后台(可用 SQL/脚本先顶)。

---

## 3. 接口契约(OpenAPI 风格草案)

约定:所有接口 /v1 前缀;JSON;错误统一 {error: {code, message}};时间 ISO 8601 UTC。
认证:Authorization: Bearer <user_jwt>(用户态)或 X-Service-Key(服务态,按 scope 授权)。

### 3.1 账户

    POST /v1/auth/register
      body: {email, display_name?, timezone?}
      -> 201 {user_id, email, status: "unverified"}  # 同步发验证邮件

    POST /v1/auth/verify-email
      body: {token}
      -> 200 {user_id, verified: true}

    POST /v1/auth/login/request        # magic link 或验证码(实现其一即可,推荐 magic link)
      body: {email}
      -> 202

    POST /v1/auth/login/verify
      body: {token}
      -> 200 {access_token, refresh_token?, user: {...}}

    POST /v1/auth/logout
      -> 204

    GET  /v1/me
      -> {user_id, email, verified, display_name, avatar_url, timezone,
          telegram: {bound, username, id} | null,
          points: {balance, updated_at}}      # 积分暂无链上权威时返回 0/占位

    PATCH /v1/me
      body: {display_name?, avatar_url?, timezone?}

### 3.2 Telegram 绑定

    POST /v1/me/telegram
      body: {init_data}                  # Telegram WebApp initData 原始字符串
      -> 200 {bound: true, telegram_id, username}
      # 服务端按 Telegram 官方算法验签(HMAC-SHA256 with secret_key = HMAC(bot_token,"WebAppData"))

    DELETE /v1/me/telegram
      -> 204

### 3.3 服务密钥(业务系统 -> CAS)

    POST /v1/service-keys             # [admin]
      body: {name, scopes: ["users:read","points:write","checkin:issue"]}
      -> 201 {key_id, secret}          # secret 仅展示一次

    DELETE /v1/service-keys/{id}
      -> 204

    # 服务态调用示例:
    GET  /v1/users/{user_id}                    # scope: users:read
    GET  /v1/users/{user_id}/points             # scope: points:read
    POST /v1/users/{user_id}/points/adjust      # scope: points:write
      body: {delta, reason, ref_type?, ref_id?} # 正数发放/负数扣减;余额不足返回 422

### 3.4 积分账本

    GET  /v1/points/ledger?since=&cursor=
      -> {entries: [{id, user_id, delta, reason, ref_type, ref_id, created_at}], next_cursor}

原则:append-only;余额 = sum(delta);adjust 必须带 reason 与业务引用;所有变更可追溯。

### 3.5 签到(一次性领取网址)

    POST /v1/checkin/tokens                     # scope: checkin:issue(业务系统调用)
      body: {event_id, registration_id, event_url, ttl_seconds?, max_uses: 1}
      -> 201 {token_id, claim_url, expires_at}
      # claim_url = event_url + "?ck=" + token_id + "&sig=" + HMAC_SHA256(secret, token_id|event_id|registration_id|exp)

    POST /v1/checkin/claim                      # 参与者打开领取网址时业务系统回调 CAS 校验
      body: {token_id, sig}
      -> 200 {valid: true, event_id, registration_id, claimed_at}   # 一次性:重复返回 409
      -> 410 {error: "expired"} / 404 {error: "unknown_token"} / 409 {error: "already_claimed"}

    GET  /v1/checkin/tokens/{id}
      -> {status: pending|claimed|expired, claimed_at, nft_claim_id?}

    POST /v1/checkin/tokens/{id}/nft-claim      # V2 预留:登记 NFT 领取
      body: {nft_contract, token_id, tx_hash}
      -> 201

### 3.6 Webhooks(CAS -> 业务系统,可选一期)

    POST {business_webhook_url}
      events: user.verified, user.updated, points.changed, telegram.bound
      签名:X-CAS-Signature = HMAC_SHA256(webhook_secret, body)
      # 业务系统用于更新镜像;失败按指数退避重试

---

## 4. 非功能要求

- **安全**:验证/登录 token 一次性、短 TTL(24h/15min);密码不存储(magic link 模式);service key 哈希存储;全接口 HTTPS;限流(按 IP + 按用户)。
- **审计**:账户、积分、签到令牌的所有变更写审计日志。
- **可部署**:Docker 镜像 + docker-compose(Postgres + 服务);开源许可与 4Seas-bot 一致(Apache-2.0)。
- **可观测**:/healthz;结构化日志;关键操作(发积分、签到)可追踪。
- **数据可携带**:用户数据导出接口(GDPR/个保法)。

---

## 5. 与 CommunityOS 的对接清单(业务系统侧实现)

1. 登录跳转 CAS 或嵌入 CAS 登录组件;回调后本地建会话(存 cas_user_id + 本地角色)。
2. 定时/按需同步用户资料与 telegram 绑定状态到本地镜像表。
3. 积分展示读镜像;预订扣减(当前关闭)经 POST /users/{id}/points/adjust。
4. 活动发布后为每个报名者批量调 /checkin/tokens 生成 claim_url;主持人端轮换二维码指向最新 claim_url;参与者扫码 → 业务系统回调 /checkin/claim。
5. 订阅 CAS webhooks(若一期提供)更新镜像。

---

## 6. 里程碑建议(CAS)

- CAS-M1(2 周):账户(注册/验证/登录/会话)+ /me + service keys + Docker 部署。
- CAS-M2(2 周):Telegram 绑定 + 积分账本(接口 + 流水)+ webhooks。
- CAS-M3(V2):链上积分(SIWE 绑定、链上权威同步)、NFT claim 对接外部 NFT 系统。

---

## 7. 开放问题(CAS)

| # | 问题 | 建议 |
| --- | --- | --- |
| Q1 | 登录方式:magic link 还是邮箱验证码? | 推荐 magic link(与"通知账户"定位一致,验证邮件即登录邮件) |
| Q2 | 积分是否需要多账本(场地/咖啡/住宿分桶)? | 一期单账本 + reason 分类;多账本 V2 |
| Q3 | 链上集成选哪条链/合约? | V2 决策;一期接口预留 chain/contract 字段 |
| Q4 | service key 的 scope 粒度? | 一期按资源:动作 两级(users:read, points:write, checkin:issue) |
| Q5 | 是否一期就提供 webhooks? | 建议提供(CAS 是权威源,推送比轮询及时) |
