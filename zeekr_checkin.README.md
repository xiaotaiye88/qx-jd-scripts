# 极氪 (ZeekrLife) 自动签到 - Quantumult X

基于抓包 + H5 前端 JS 逆向的圈x 自动签到脚本，支持：
- ✅ 每日签到状态查询（Z-Green 签到）
- ✅ **多账号**（按 JWT `jti` 去重，循环执行，汇总通知）
- ✅ 任务奖励**自动领取**（任务达成 → 碎片自动入账 → 脚本收集即领取）
- ✅ 能量碎片自动收集（任务碎片 batchApply + 能量达标碎片 collectIntegralZeekrBalls，均实测成功）
- ✅ **碳能量球自动收取**（WALK/驾车，实测 collectedAllEnergy 成功）
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

**接口清单**（2026-08 实测验证）：
- `GET /zeekrlife-mp-sic/v1/signinzgreen/toc/taskGet` — 签到状态查询（每日签到任务 `taskStatus=true` 即已签）
- `GET /zeekrlife-app-user/v1/user/info/home` — 用户信息（昵称/积分等）
- `POST /zeekrlife-mp-mkt/open/v1/taskProgress/taskMsg` — 任务列表（活动 medal_compose_task_manage）
- `POST /zeekrlife-mp-val/v1/carEnergy/getUncollectedBallsPageNew` — 待收集能量球/碎片查询
- `POST /zeekrlife-mp-mkt/toc/v1/apply/batchApply` — **能量碎片收集（即自动领取奖励）**（实测成功）：
  ```
  { "applyCmdList": [{
      "record": "<eventCode>",
      "payContent": { "bubbleAssetsId": "<碎片id>" },
      "applyExt": { "origin": "<sourceId>" }
  }] }
  ```
  `record/payContent/applyExt` 均来自 `getUncollectedBallsPageNew` 响应。
  **注意**：batchApply 仅适用于任务碎片（EASY_DEBRIS/DIFFICULT_DEBRIS 等）；
  对能量达标碎片（ENERGY_STANDARDS，eventCode=z_green_active）会返回「未查询到相关活动！」，须用下方接口。
- `POST /zeekrlife-mp-val/v1/carEnergy/collectIntegralZeekrBalls` — **能量达标碎片收取**（ENERGY_STANDARDS 等，实测成功）：
  ```
  { "energyIds": ["<碎片id>"] }
  ```
  逐个收集。针对 `eventCode` 非空但不是 batchApply 活动编码的碎片（如 `z_green_active`），
  逆向自 H5 前端 `index-94ba24e9.js` 收取函数 `te()` 的非 WALK/TRAVEL 分支（无需 riskToken）。
- `POST /zeekrlife-mp-val/v1/carEnergy/collectedAllEnergy` — **碳能量球收取**（WALK/驾车，实测成功）：
  ```
  { "energyIds": ["<球id>"] }
  ```
  逐个收集。**注意字段名是 `energyIds`**（数组），不是 `accountId`/`ids`（此前用错字段会返回 999999「登录信息与数据不一致」）。
  该接口逆向自 H5 前端 `index-94ba24e9.js` 的收取函数（WALK/TRAVEL_MILEAGE 分支）。

> 💡 **奖励自动领取机制**：签到/任务条件达成后，奖励碎片会**自动进入「待收集」列表**（抓包实测：
> 碎片 `sourceId` 为「signup-2026-08-04」（签到）和「步行3000步」（任务）），
> 因此脚本收集碎片（batchApply）**即等于自动领取奖励**，无需单独的「领取」接口。
> 唯一前提是任务条件真实达成（如当日步数 ≥3000），脚本负责把已达成任务的奖励收走。

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
✅ 今日已签到
🎁 任务奖励: 无可领取（4 个任务）
⚡ 碎片收集成功 2 项
⚡ 碳能量收取成功 1 项
```

（任务达成时：`🎁 任务奖励已达成: 步行3000步（碎片已自动入账，下方收集即领取）`）

## 注意事项

1. 脚本仅供学习交流，请勿用于商业用途
2. 频繁签到（同一天多次）不会获得更多奖励，且可能触发风控
3. 如遇 `code` 非 000000，请检查 Token 是否失效
4. 签名密钥存在于前端公开 JS 中（混淆），属公开信息；**Token 属个人凭证，仅存储在你本机 BoxJs**
5. 能量碎片 + 碳能量球由脚本自动收集/收取（任务碎片走 batchApply，达标碎片走 collectIntegralZeekrBalls，碳能量走 collectedAllEnergy）
6. 不同 App 版本接口可能变化，脚本基于 2026-08 抓包验证
