# 什么值得买 (SMZDM) 自动签到 - Quantumult X

基于抓包逆向分析的圈x 自动签到脚本，支持：
- ✅ 每日自动签到
- ✅ 查询签到奖励
- ✅ 连续签到额外奖励
- ✅ 值会员信息查询
- ✅ 结果推送通知

## 原理说明

**签名算法**（已通过抓包数据 100% 验证）：

```
参数按 key 字母排序 → k=v&k=v&... → 末尾拼 &key=zok5JtAq3$QixaA%mncn*jGWlEpSL3E1 → MD5 大写
```

**签到接口**：
- `POST https://user-api.smzdm.com/checkin` — 每日签到
- `POST https://user-api.smzdm.com/checkin/all_reward` — 签到奖励
- `POST https://user-api.smzdm.com/checkin/extra_reward` — 连续签到额外奖励
- `POST https://user-api.smzdm.com/checkin/show_view_v2` — 签到状态查询
- `POST https://user-api.smzdm.com/vip` — 会员信息

## 使用方法

### 1. 获取 Cookie（首次）

在圈x 配置中加入重写规则，然后打开什么值得买 App 的「签到」页面：

```properties
[rewrite_local]
# 抓取 Cookie（获取成功后注释掉）
^https?:\/\/user-api\.smzdm\.com\/checkin url script-response-body https://raw.githubusercontent.com/<你的用户名>/<你的仓库>/main/smzdm_checkin.js
```

等待通知提示「Cookie 已保存」后，**注释掉上面的抓取规则**（避免每次签到都触发抓取）。

### 2. 配置定时任务

```properties
[task_local]
30 9 * * * https://raw.githubusercontent.com/<你的用户名>/<你的仓库>/main/smzdm_checkin.js, tag=什么值得买签到, enabled=true
```

> 每天 9:30 自动签到。

### 3. MITM 配置

```properties
[mitm]
hostname = user-api.smzdm.com
```

> 抓取 Cookie 时需要开启 MITM，之后可关闭。

## Cookie 有效期

什么值得买的 `sess` Cookie 一般有效 **30 天**。过期后需要重新抓取一次。

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
