# 京东试用领京豆（1分购）

`scripts/jd_trial_bean.qx.js` — 全自动领取京东 App「1分购 / 试用」频道活动页里的"领京豆"任务。

- 活动页：`https://pro.m.jd.com/mall/active/G7sQ92vWSBsTHzk4e953qUGWQJ4/index.html`（京东 App 搜索「1分购」进入）
- cron：每天 9:17 / 16:17 各跑一次（任务刷新时间不固定，多跑两次兜底）
- **2026-10-09 起全自动**：脚本内嵌京东官方 h5st 5.3 lite SDK，在圈X 里直接生成领取签名，无需打开 App（此前为半自动深链兜底，兜底仍保留）。

## 协议与逆向记录（2026-10-08~09，两轮抓包 + 逆向）

| 步骤 | 接口 | 说明 |
|---|---|---|
| 风险日志 | `POST api.m.jd.com/api?functionId=reportInvokeLog` | App 打开活动页必发，脚本领取前模拟一次 |
| 查任务 | `POST api.m.jd.com/?appid=newtry&functionId=qryH5BabelFloors` | 需 h5st 5.3；响应 `floorResponse.<楼层>.providerData.data.taskReward.data.result.taskInfo.taskList[]` 即任务列表，每项含 `encryptAssignmentId`、`completionFlag`、`rewards[]`（京豆数量） |
| 领取 | `POST api.m.jd.com/?appid=newtry&functionId=common_do_task` | 需 h5st 5.3；body：`{"channelId":"20","itemId":"1","assignmentId":"<encryptAssignmentId>","actionType":"0","ext":{"queryReceiveTimes":1,"doReceiveRewards":1},"extMap":{"sceneType":1,"babelChannel":"ttt63"}}`；成功时 `data.result.assignmentResult.rewardsInfo.successRewards` 里是京豆 |

两个接口的 URL query 需带 `client=apple&clientVersion=16.0.70&loginType=2&appid=newtry` 等参数（见脚本 `apiUrl()`）。

## h5st 5.3 破解要点

- 活动页加载的是 **H5 lite SDK** `js_security_v3_lite_0.1.5.js`（官方 CDN `storage.360buyimg.com/webcontainer/`），暴露 `window.ParamsSignLite`。脚本把它**逐字内嵌**，前面垫一层无头浏览器桩（window/document/navigator/localStorage/XHR…）即可运行。
- `new ParamsSignLite({appId:'35fa0'})`（活动页 appId，必须 5 位）→ `signSync({functionId, body, timestamp})` 返回的 `h5st` 参数服务端直接接受（实测 `code:0 isLogin:true`）。
- **首次签名会异步**向 `cactus.jd.com/request_algo` 拉算法 token（走 XHR），脚本预热一次后等 5 秒再正式签。
- 设备指纹 fp 存在 localStorage：桩里的 localStorage 接到 `$persistentStore`（键 `jd_trial_ls`），保证 fp 跨运行稳定，不被风控识别为新设备。
- **sdtoken**：api.m.jd.com 用响应头 `x-rp-sdtoken: set;<ttl秒>;<token>` 下发（TTL 30 分钟），要回存成 cookie `sdtoken` 随后续请求发送；脚本按 `pt_pin` 持久化（键 `jd_trial_sd_<pin>`），过期自动重取。
- h5st 参数结构：`ts串;fp;appId;tk03token;sha256sig;5.3;ts毫秒;加密块;hash2;hash3`。

## 实测结论

- **签名链路已通**：Node 与圈X 同构环境下，lite SDK 生成的 h5st 5.3 被服务端接受，查询返回完整任务列表。
- **HTTP 403 + 空响应体 ≠ 脚本问题**：京东 WAF 对**机房/云 IP 的 POST** 会整体拦截（GET 不受影响），住宅宽带/蜂窝网络正常。在 Mac/云服务器上调试遇到持续 403 属正常现象，请在手机圈X 上跑。
- **请求频率限制**：短时间内连续请求仍会触发限频。脚本已限速：账号间 8s、任务间 2s、重试仅限京豆任务 2 次、引导类任务单次。
- **任务是每账号独立实例**：同一天不同账号看到的任务不同（5豆/10豆/15豆高低活合并等会轮换），`assignmentTimesLimit=1`、活动期跨数月，列表不定期刷新。
- 楼层号 `122572153`、活动 ID、`babelChannel` 都是抓包固定值，京东改版时改脚本头部常量即可（响应解析用递归找 `encryptAssignmentId`，不依赖具体楼层号）。
- 个别任务若仍被软拒（如引导类任务需 App 内动作），推送通知附深链，点通知直达活动页在 App 内手动领取（兜底）。

## 安装

1. 无需配置 Cookie：圈X 里开着京东抓包重写（`CookiesJD`）即可，脚本直接读取；多账号自动按 `pt_pin` 去重。
2. 任务订阅 / `jd_scripts.conf` 已含本任务（tag=试用领京豆），**脚本已换成 h5st 全自动版，旧订阅需在圈X 任务页点一次"更新"**；手动添加用脚本头部的 `[task_local]` 行。
3. 首次运行会多花 ~5 秒预热签名 token，属正常。
4. 报"疑似风控限频(HTTP 403)"时，等 10-30 分钟再手动跑一次即可，不影响 Cookie。

## 可选：从青龙取 Cookie

手机 CookiesJD 里的条目容易陈旧（抓一次存一次），青龙上的 `JD_COOKIE` 由 wskey 转换链路持续续期，是更可靠的来源。配置方法：

1. 青龙面板 → 设置 → **应用设置** → 新建应用：名称随意，权限勾选「**环境管理 → 查看消息**」（环境变量查询）→ 创建后得到 `Client ID` / `Client Secret`。
2. 圈X → BoxJs → 京东脚本 → **试用领京豆** → 填 `青龙地址`（如 `http://192.168.x.x:5700`）、`Client ID`、`Client Secret`。
3. 脚本运行时自动拉取青龙上全部 `JD_COOKIE`（多账号换行分隔的也支持），按 `pt_pin` 去重；青龙连不上自动回退 CookiesJD。

## Node 调试

```bash
JD_COOKIE='pt_key=...;pt_pin=...;' node scripts/jd_trial_bean.qx.js   # 多账号用 JD_COOKIES 换行分隔
```

注意：Mac/服务器多为机房 IP，POST 大概率 403——只用来验证签名与流程，领取以手机为准。fp/sdtoken 缓存落在 `/tmp/jd_trial_ls.json`、`/tmp/jd_trial_sd_<pin>.json`。

## 通知示例

```
京东试用领京豆
【jd_xxx】共3个任务，已领1，本次+15京豆
· 平台高活x试用其他（10京豆） ✅ +10京豆
· 平台低活x试用全量（5京豆） ✅ +5京豆
⚠️ 自编辑固坑5豆（试用-固坑引导5京豆） 领取被拒（当前参与人数过多，请稍后再试），可在App内领取
```

有待领任务时通知带副标题，点击通过 `openapp.jdmobile` 深链直达 JD App 活动页手动领取（兜底）。
