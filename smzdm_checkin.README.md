# 什么值得买 (SMZDM) 自动签到 - Quantumult X

基于抓包逆向分析的圈x 自动签到脚本，支持：
- ✅ 每日自动签到
- ✅ 查询签到奖励
- ✅ 连续签到额外奖励
- ✅ 值会员信息查询
- ✅ Cookie 自动抓取（打开 App 即存入 BoxJs）
- ✅ 结果推送通知

## 原理说明

**签名算法**（已通过抓包数据 100% 验证）：

```
参数按 key 字母排序 → 跳过空值 → k=v&k=v&... → 末尾拼 &key=zok5JtAq3$QixaA%mncn*jGWlEpSL3E1 → MD5 大写
```

**签到接口**：
- `POST https://user-api.smzdm.com/checkin` — 每日签到
- `POST https://user-api.smzdm.com/checkin/all_reward` — 签到奖励
- `POST https://user-api.smzdm.com/checkin/extra_reward` — 连续签到额外奖励
- `POST https://user-api.smzdm.com/checkin/show_view_v2` — 签到状态查询
- `POST https://user-api.smzdm.com/vip` — 会员信息

## 快速开始（推荐：一键资源订阅）

圈X → 设置 → 资源 → 引用，添加：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/smzdm_scripts.conf
```

该订阅自动包含：Cookie 抓取重写（`[rewrite_local]`）+ 每日签到任务（`[task_local]`）+ MITM（`[mitm]`）。

同时建议添加 BoxJs 订阅（可选，用于查看/手动编辑 Cookie）：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/boxjs/qx-jd.boxjs.json
```

## 手动配置（不想要资源订阅时）

### 1. 获取 Cookie（首次）

在圈x 配置中加入重写规则，然后打开什么值得买 App **随便逛逛**（任意接口请求都会触发，不限于签到页）：

```properties
[rewrite_local]
# 抓取 Cookie（收到「Cookie 已保存」通知后注释掉）
^https?:\/\/user-api\.smzdm\.com\/ url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/smzdm_checkin.qx.js
```

等待通知提示「Cookie 已保存」后，**注释掉上面的抓取规则**（避免每次请求都重复抓取）。

### 2. 配置定时任务

```properties
[task_local]
30 9 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/smzdm_checkin.qx.js, tag=什么值得买签到, enabled=true
```

> 每天 9:30 自动签到。

### 3. MITM 配置

```properties
[mitm]
hostname = user-api.smzdm.com
```

> 抓取 Cookie 时需要开启 MITM，之后可关闭。

## Cookie 有效期

什么值得买的 `sess` Cookie 一般有效 **30 天**。脚本会在超过 20 天时提示重新抓取。过期后只需重新打开 App 即可自动刷新。

## 通知内容示例

```
✅ 签到成功！连续 3 天
🏅 金币: 0 | 碎银: 45 | 补签卡: 6
🎁 每日签到奖励: 随机金币/碎银
🎁 连续签到奖励: xxx
👑 值会员: 3 (1200/1500)
```

## 注意事项

1. 脚本仅供学习交流，请勿用于商业用途
2. 频繁签到（同一天多次）不会获得更多奖励，且可能触发风控
3. 如遇 `error_code` 非 0，请检查 Cookie 是否过期
4. 不同 App 版本接口可能变化，脚本基于 11.1.8 (iOS) 验证
