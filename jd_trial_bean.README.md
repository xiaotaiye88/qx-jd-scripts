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

## 实测结论

- **无需 h5st 签名**：App 原始请求带 h5st 5.3，但实测不带 h5st、不带 `x-api-eid-token`，仅靠 Cookie 即可查询与领取（外层 `code:0`）。任务不可领时业务层返回 `bizCode -100/-101`（"当前参与人数较多/过多，请稍后再试"），这是通用业务文案，不是风控报错——对已领完的任务重放有效 h5st 也返回同样文案。
- **任务是按周期发的**：`assignmentStartTime/EndTime` 跨数月、`assignmentTimesLimit=1`（整个活动期一次），列表会不定期刷新出新任务，所以脚本每次跑都全量查一遍、只领 `completionFlag=false` 的。
- **引导类任务直领不了**：如"自编辑固坑引导5京豆"（`guideTaskId` 类），需要先在 App 内完成引导动作，脚本直领返回 -101，会如实出现在通知里，属预期现象。
- 楼层号 `122572153`、活动 ID、`babelChannel` 都是抓包固定值，京东改版时改脚本头部常量即可（响应解析用递归找 `encryptAssignmentId`，不依赖具体楼层号）。

## 安装

1. 确认已按仓库主 [README](README.md) 配好 Cookie 抓取（`CookiesJD`）。
2. 任务订阅 / `jd_scripts.conf` 已含本任务（tag=试用领京豆），更新订阅即可；手动添加用脚本头部的 `[task_local]` 行。
3. 打开一次京东 App 的「1分购」活动页确认任务存在；之后到点自动领取并推送结果。

## 通知示例

```
京东试用领京豆
共3个任务，已领1，本次+10京豆
✅ 平台高活x试用其他（10京豆） +10京豆
⚠️ 自编辑固坑5豆（试用-固坑引导5京豆） 领取失败: 当前参与人数过多，请稍后再试
· 平台低活x试用全量（5京豆） 已领取
```
