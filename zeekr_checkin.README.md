# 极氪 (ZeekrLife) 自动签到 - Quantumult X

基于抓包 + H5 前端 JS 逆向的圈x 自动签到脚本，支持：
- ✅ 每日自动签到（连续签到）
- ✅ **多账号**（按 JWT `jti` 去重，循环执行，汇总通知）
- ✅ 任务奖励自动领取（步行 3000 步等，达标即领）
- ✅ 能量球一键收集（车能量）
- ✅ Token 自动抓取（打开 App 即存入 BoxJs）
- ✅ 结果推送通知

## 原理说明

**签名算法**（由 H5 前端 JS `zeekr_bundle-*.js` 逆向得出，已用抓包数据 100% 验证）：

极氪接口网关 `api-gw-toc.zeekrlife.com` 要求每个请求带 `x_ca_sign` 签名头，算法为：

```
x_ca_sign = SHA1( [签名密钥, x_ca_nonce, x_ca_timestamp].sort().join('') )
```

签名密钥存在前端混淆 JS 中（AES-GCM + 位运算解密出一段 DER 格式 RSA 公钥，充当服务端签名密钥的"公钥段"），
以 `app_code: toc_h5_green_zeekrapp`（H5 免签通道）请求原生网关接口即可通过校验。

**接口清单**：
- `GET /zeekrlife-app-user/v1/user/info/home` — 签到状态查询（signStatus / signInNumber）
- `GET /zeekrlife-mp-sic/v1/signin/create` — 每日签到
- `POST /zeekrlife-mp-mkt/open/v1/taskProgress/taskMsg` — 任务列表（活动 medal_compose_task_manage）
- `POST /zeekrlife-mp-mkt/v1/taskProgress/take` — 任务奖励领取
- `POST /zeekrlife-mp-val/v1/carEnergy/getUncollectedBallsPageNew` — 待收集能量球查询
- `POST /zeekrlife-mp-val/v1/carEnergy/collectedAllEnergy` — 能量球一键收集

## 快速开始（推荐：一键资源订阅）

圈X → 设置 → 资源 → 引用，添加：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/zeekr_scripts.conf
```

该订阅自动包含：Token 抓取重写（`[rewrite_local]`）+ 每日签到任务（`[task_local]`）+ MITM（`[mitm]`）。

同时建议添加 BoxJs 订阅（可选，用于查看/手动编辑 Token）：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/boxjs/qx-jd.boxjs.json
```

## 手动配置（不想要资源订阅时）

### 1. 获取 Token（首次）

在圈x 配置中加入重写规则，然后打开极氪 App **任意页面**（任意 `api-gw-toc.zeekrlife.com` 请求都会触发，不限于签到页）：

```properties
[rewrite_local]
# 抓取 Token（收到「Token 已保存」通知后注释掉）
^https?:\/\/api-gw-toc\.zeekrlife\.com\/ url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/zeekr_checkin.qx.js
```

等待通知提示「Token 已保存」后，**注释掉上面的抓取规则**（避免每次请求都重复抓取）。

### 2. 配置定时任务

```properties
[task_local]
30 9 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/zeekr_checkin.qx.js, tag=极氪签到, enabled=true
```

> 每天 9:30 自动签到。

### 3. MITM 配置

```properties
[mitm]
hostname = api-gw-toc.zeekrlife.com
```

> 抓取 Token 时需要开启 MITM，之后可关闭。

## Token 有效期

极氪 JWT 有效期较长（无需频繁重抓）。若脚本提示 Token 失效，重新打开 App 任意页面即可自动刷新（`jti` 相同会去重覆盖）。

## 多账号

- 打开 App 抓包时，脚本按 JWT `jti`（accountId）**自动去重合并**到 BoxJs 的 `zeekr_tokens`（JSON 数组），多账号轮流打开 App 即可全部收录，通知会提示「共 N 个账号」。
- 签到任务会**循环所有账号**依次执行，一次通知汇总所有结果（每个账号前带昵称标签）。
- 也可在 BoxJs → 极氪签到 → `zeekr_tokens` 手动编辑（格式 `[{"token":"Bearer xxx","name":"昵称"}]`）。

## 通知内容示例

```
👤 小太爷88
✅ 今日已签到（连续 2 天）
🎁 任务奖励: 今日无可领取（4 个任务）
⚡ 能量球: 已全部收集
```

## 注意事项

1. 脚本仅供学习交流，请勿用于商业用途
2. 频繁签到（同一天多次）不会获得更多奖励，且可能触发风控
3. 如遇 `code` 非 000000，请检查 Token 是否失效
4. 签名密钥存在于前端公开 JS 中（混淆），属公开信息；**Token 属个人凭证，仅存储在你本机 BoxJs**
5. 不同 App 版本接口可能变化，脚本基于 2026-08 抓包验证
