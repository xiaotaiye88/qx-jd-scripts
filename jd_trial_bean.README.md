# 京东试用领京豆（1分购）

`scripts/jd_trial_bean.qx.js` — 自动领取京东 App「1分购 / 试用」频道活动页里的"领京豆"任务。

- 活动页：`https://pro.m.jd.com/mall/active/G7sQ92vWSBsTHzk4e953qUGWQJ4/index.html`（京东 App 搜索「1分购」进入）
- cron：每天 9:17 / 16:17 各跑一次（任务刷新时间不固定，多跑两次兜底）

## 抓包逆向记录（2026-10-08）

 今早在 App 里手动领取（10:03 领 5 京豆、10:05 领 10 京豆）时抓的 HAR，还原出完整协议：

| 步骤 | 接口 | 说明 |
|---|---|---|
| 查任务 | `POST https://api.m.jd.com/?appid=newtry&functionId=qryH5BabelFloors` | body 为活动/楼层参数；响应 `floorResponse.<楼层>.providerData.data.taskReward.data.result.taskInfo.taskList[]` 即任务列表，每项含 `encryptAssignmentId`、`completionFlag`、`rewards[]`（京豆数量） |
| 领取 | `POST https://api.m.jd.com/?appid=newtry&functionId=common_do_task` | body：`{"channelId":"20","itemId":"1","assignmentId":"<encryptAssignmentId>","actionType":"0","ext":{"queryReceiveTimes":1,"doReceiveRewards":1},"extMap":{"sceneType":1,"babelChannel":"ttt63"}}`；成功时 `data.result.assignmentResult.rewardsInfo.successRewards` 里是京豆 |

两个接口的 URL query 需带 `client=apple&clientVersion=16.0.70&loginType=2&appid=newtry` 等参数（见脚本 `apiUrl()`）。

## 实测结论（2026-10-08~09，两轮抓包 + 3 账号实测）

- **查询接口无需任何签名**：`qryH5BabelFloors` 仅凭 Cookie 可用（含失效检测 `isLogin:false`），稳定可靠。
- **领取接口（`common_do_task`）强校验 App 上下文**。以下 4 种组合全部被软拒（业务层 -100/-101「参与人数较多/过多」或接口层 403/404/405「活动火爆，请稍后再试」，文案随机）：
  1. 无签名裸调；
  2. h5st 3.0（cactus request_algo，appId `eypbi17p2bn2nyp8`，gúagua 同款签名器）；
  3. App 原生网关 `client.action` + `sign=`（md5 设备签名，wskey 转换同款算法）；
  4. 附加抓包的 `x-api-eid-token`。
  唯一稳定的成功路径是 **App 内请求（fresh h5st 5.3 + 设备采集）**。要全自动只能逆向 jd-sec 的 5.3 签名 SDK，成本/收益不成比例，故脚本采用半自动：查询 → 尝试领取（万一风控放行）→ 失败则推送**深链通知**，点通知直达活动页一键领取。
- **请求频率限制**：短时间内连续十几个请求会触发京东 WAF，返回 HTTP 403 + 空响应体。脚本已限速：账号间 8s、任务间 2s、重试仅限京豆任务 2 次、引导类任务单次。
- **任务是每账号独立实例**：同一天不同账号看到的任务不同（5豆/10豆/15豆高低活合并等会轮换），`assignmentTimesLimit=1`、活动期跨数月，列表不定期刷新。
- 楼层号 `122572153`、活动 ID、`babelChannel` 都是抓包固定值，京东改版时改脚本头部常量即可（响应解析用递归找 `encryptAssignmentId`，不依赖具体楼层号）。

## 安装

1. 无需配置 Cookie：圈X 里开着京东抓包重写（`CookiesJD`）即可，脚本直接读取；多账号自动按 `pt_pin` 去重。
2. 任务订阅 / `jd_scripts.conf` 已含本任务（tag=试用领京豆），更新订阅即可；手动添加用脚本头部的 `[task_local]` 行。
3. 打开一次京东 App 的「1分购」活动页确认任务存在；之后到点自动领取并推送结果。
4. 报"疑似京东风控限频(HTTP 403)"时，等 10-30 分钟再手动跑一次即可，不影响 Cookie。

## 可选：从青龙取 Cookie

手机 CookiesJD 里的条目容易陈旧（抓一次存一次），青龙上的 `JD_COOKIE` 由 wskey 转换链路持续续期，是更可靠的来源。配置方法：

1. 青龙面板 → 设置 → **应用设置** → 新建应用：名称随意，权限勾选「**环境管理 → 查看消息**」（环境变量查询）→ 创建后得到 `Client ID` / `Client Secret`。
2. 圈X → BoxJs → 京东脚本 → **试用领京豆** → 填 `青龙地址`（如 `http://192.168.x.x:5700`）、`Client ID`、`Client Secret`。
3. 脚本运行时自动拉取青龙上全部 `JD_COOKIE`（多账号换行分隔的也支持），按 `pt_pin` 去重；青龙连不上自动回退 CookiesJD。

## 通知示例

```
京东试用领京豆  〔副标题：有待领15京豆，点击去App领取〕
【jd_xxx】共3个任务，已领1，本次无新增，待领15京豆（点通知去App领取）
· 平台高活x试用其他（10京豆） 已领取
⚠️ 平台低活x试用全量（5京豆） 脚本领取被拒（活动火爆，请稍后再试吧～），需在App内领取
⚠️ 自编辑固坑5豆（试用-固坑引导5京豆） 脚本领取被拒（当前参与人数过多，请稍后再试），需在App内领取
```

有待领任务时点通知，通过 `openapp.jdmobile` 深链直达 JD App 活动页，逐个点"领取"即可（App 内带 h5st 5.3，必成功）。
