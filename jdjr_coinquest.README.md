# 京东金融赚京豆（jdjr_coinquest.qx.js）

京东金融 App「做任务领京豆」页面的任务自动接取脚本（Quantumult X）。

## 功能

1. 拉取京豆任务列表（做任务领京豆二级页，pageType=11189）
2. 自动接取所有可接取的任务（接取后任务从列表消失）
3. 复查剩余任务，输出摘要
4. 触发风控时立即停手并提示重新打开 App 刷新参数

## 使用步骤

### 1. 添加配置

```text
[task_local]
20 10 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/jdjr_coinquest.qx.js, tag=京东金融赚京豆, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jd_bean_home.png, enabled=true

[rewrite_local]
^https?://ms\.jr\.jd\.com/gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate\?pageType=11189 url script-request-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/jdjr_coinquest.qx.js
```

MITM 需要包含 `ms.jr.jd.com`。

> ⚠️ 抓取规则必须用 **script-request-body** 类型（不是 script-request-header）：
> `script-request-header` 读不到请求体，无法保存任务列表请求参数。

### 2. 抓取参数（重要）

打开京东金融 App → 我的 → 京豆 → **做任务赚京豆**（进这个页面最关键）。
页面加载时会产生 `ms.jr.jd.com/gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate?pageType=11189` 请求，
脚本会自动抓取：

- **Cookie**（含 pt_key/pt_pin/设备 token）
- **任务列表请求参数**（含 nonce/signature/deviceInfos/cco h5st 等风控签名字段）
- **App 真实请求头**（UA 等，重放时原样使用，避免被网关识别为脚本）

抓取成功后通知提示「参数已抓取」，之后可注释掉抓取规则（或保留，每次打开 App 会自动刷新）。

### 3. 运行

定时任务会自动运行，也可以手动点运行。运行结果通知示例：

```text
📅 参数抓取于 2026/8/5 13:49:01
💰 当前京豆: 2048
📋 可接取 3 项:
  · 逛每日补贴好物 +1
  · 逛每日推荐好物 +1
  · 逛每日热销好物 +1
  ✅ 逛每日补贴好物 接取成功
  ✅ 逛每日推荐好物 接取成功
  ✅ 逛每日热销好物 接取成功
🔎 复查: 剩余 0 项未接取
📊 本次: 成功接取 3，失败 0
```

## 接口（逆向自 coinQuest H5 页面 main_712f8c1d1f.js）

| 接口 | 用途 |
|------|------|
| `POST /gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate?pageType=11189` | 任务列表 |
| `POST /gw2/generic/mission/newh5/m/receiveMissionForNa` | 接取任务（成功 `code=0000 接取成功`） |

任务列表响应结构：`resultList[templateType=256610003].templateData.taskList[]`，
每项含 `missionId` / `channelCode` / `status`(-1 未接取) / `receivingStatus`(1 可接取) / `title.text` / `awardNumber.text`。

## ⚠️ 风控说明（必读）

这个页面有京东风控（AAR2 风控 SDK），请求里的 `nonce/signature/deviceInfo1/h5st` 由手机上的
京东金融 App 内置 SDK 实时生成，与设备绑定。脚本通过 rewrite 抓取**最近一次真实请求的参数**并复用：

- 打开 App 后参数自动刷新，正常使用没问题
- **超过约 1 天没打开 App**，参数可能过期，被风控拒绝（建议每天打开一次 App，或至少每周）
- 被风控时接口返回 `resultCode=20001400 "brush or crawler request"` 或
  `resultCode=3 "请先登录您的京东账号"`（此时 App 内实际是正常登录的）
- 脚本检测到风控会**立即停手**并通知，不会继续刷
- 手动频繁运行可能触发风控，建议按定时每天一次即可

## 数据存储（BoxJS）

| 键 | 说明 |
|----|------|
| `jdjr_ck` | 京东金融 Cookie（自动抓取） |
| `jdjr_req` | 任务列表请求参数，含风控签名（自动抓取） |
| `jdjr_req_ts` | 参数抓取时间戳（自动记录） |

> 注意：以上数据为私有数据（含登录 Cookie 和设备标识），只存在本机 BoxJS，不会上传仓库。
