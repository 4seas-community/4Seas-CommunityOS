# 09 · Luma 与 Social Layer 的接入方式(不订阅也可用)

> 背景:社区活动量约 10 场/天,Luma Plus 的订阅费与收益不匹配。
> 本文给出零订阅成本的发布路径,以及 Social Layer 服务账号 JWT 的获取办法。

---

## 1. Luma:不订阅怎么办

### 结论

Luma 的 REST API 与 Zapier 都属于 **Luma Plus**(官方文档明确要求),免费账号拿不到 API Key。
免费且能自动化的路径只有一条:**浏览器自动化**(复用一次登录后的会话)。
对本项目的量级,这是投入产出比最高的一档;订阅只在"付费活动多到 0% 平台费能覆盖订阅费"时才划算。

### 方案对比

| 方案 | 成本 | 自动化程度 | 稳定性 | 适用 |
| --- | --- | --- | --- | --- |
| **A. 浏览器自动化(推荐)** | 0 | 全自动/半自动 | 中(Luma 改版会失效,失败有截图) | 10 场/天完全够用 |
| B. 订阅 Luma Plus | ~$29/月起(以官网为准) | 官方 API,稳定 | 高 | 付费活动多、需要 0% 平台费 |
| C. 辅助发布 | 0 | 人工粘贴一次(约 30 秒/场) | 高 | 临时过渡 |
| D. 不做 Luma,只用自有页 + Social Layer + Telegram | 0 | 全自动 | 高 | 社区主要在 Telegram/线下时 |

### 已实现的工具(方案 A + C 合一)

```bash
# 1) 一次性登录,把会话存到 ~/.4seas/luma-state.json(不入库)
node scripts/luma-login.mjs

# 2A) 辅助模式(默认):打开 lu.ma/create,简报已在剪贴板,粘贴 + 提交
node scripts/luma-browser-publish.mjs --event <communityos-event-id>

# 2B) 自动模式:尽力填表(title/时间/地点/描述),提交前停下让人确认
node scripts/luma-browser-publish.mjs --event <communityos-event-id> --auto
```

- 事件简报直接从 CommunityOS API 取,与"API 发布"会发送的内容一致
- 自动模式对每个字段有多套选择器回退,**某个字段找不到只警告,不整体失败**
- 提交前必须人工确认:避免自动化把半成品活动发出去

### 后续可选增强(按需再做)

1. 把 `--auto` 接进同步 outbox:Luma 平台在 `sync_records` 里标记 `pending` 时,由本机 cron 跑脚本
2. 失败时保存截图 + 页面 HTML,便于快速定位选择器失效
3. 若将来 Luma 活动变多(付费票务占比高),再切回官方 API(代码已就绪,只需 `LUMA_API_KEY` + `LUMA_ENABLED=true`)

---

## 2. Social Layer(sola.day)服务账号 JWT

### 有没有申请流程?

**没有**。Social Layer 的 API 未公开文档,但接口是开放的(前端 sociallayer-im/seastar-app 开源,
`packages/sola-sdk` 就是官方 SDK)。所谓"服务账号"就是**一个普通账号,并且是 4seas 这个 group 的管理员**,
不存在审批、白名单或付费环节。任何人都可以注册账号并按下面的方式拿 token;
**能不能发布到 4seas 的活动列表,取决于该账号是否是 4seas group 的 manager。**

### 获取 JWT 的三种办法

| 办法 | 需要什么 | 自动化友好度 | 适用 |
| --- | --- | --- | --- |
| **邮箱一次性验证码** | 一个能收信的邮箱(建议专用,如 dev@4seas.xyz) | 中(需要读邮件里的码) | 推荐起步 |
| **SIWE 钱包登录** | 该账号绑定一个钱包 + 私钥 | **高(全自动,无需邮件)** | 长期自动化最优 |
| 浏览器里复制 token | 登录后的 devtools → Network → `Authorization: Bearer` | 低(会过期) | 临时验证 |

### 办法一:邮箱验证码(已实现脚本)

```bash
# 交互式:请求验证码 → 输入邮件里的 6 位码 → 打印 token
node scripts/sola-token.mjs dev@4seas.xyz

# 非交互式(CI/定时任务里读邮箱后传入)
SOLA_CODE=123456 node scripts/sola-token.mjs dev@4seas.xyz --write-env
```

脚本内部就是两步(与官网登录一致):

    POST /auth/request_code  { email }          → 发送一次性码
    POST /auth/verify_code   { email, code }    → 返回 { token, user }

拿到后写入环境即可启用单向发布:

    SOCIAL_LAYER_ENABLED=true
    SOCIAL_LAYER_TOKEN=<token>

> token 会过期(普通会话 JWT)。要长期无人值守,建议走办法二。

### 办法二:SIWE 钱包登录(推荐用于自动化)

1. 给服务账号绑定一个钱包(在 app.sola.day 的个人设置里绑定,或用钱包登录一次)
2. 之后每次取 token 只需:
   - `GET/POST /auth/nonce` 拿 nonce(服务端记 15 分钟,单次有效)
   - 用私钥对 **EIP-4361** 消息签名(消息格式见 `sola-sdk/src/auth/auth.ts` 的 `buildSiweMessage`)
   - 提交签名换 JWT
3. 因为没有邮件环节,可以完全放进 cron/worker 里自动刷新

需要时我可以补一个 `scripts/sola-token.mjs --wallet <private-key>` 的实现(依赖 `viem` 或 `ethers`)。

### 办法三:临时复制

登录 app.sola.day → 开发者工具 → Network → 任意 `api.sola.day` 请求 →
复制 Request Headers 里的 `Authorization: Bearer …` → 填进 `SOCIAL_LAYER_TOKEN`。
适合先跑通链路,不适合长期。

### 落地步骤(建议顺序)

1. 确认/创建一个专用邮箱(例如 dev@4seas.xyz),用它注册 sola.day
2. 让该账号成为 **4seas group 的 manager**(由现有管理员在 group 设置里添加)
3. 跑 `node scripts/sola-token.mjs dev@4seas.xyz --write-env`
4. 触发一次同步:`POST /v1/integrations/sync/run`(带 BOT_FEED_TOKEN),然后去 app.sola.day/event/4seas 看活动是否出现
5. 稳定后改走 SIWE,交给定时任务自动刷新
