# Quantumult X 京东脚本

在圈X（Quantumult X）上运行的京东自动化脚本集合，配合 BoxJs 使用。

## 功能一览

| 功能 | 类型 | 说明 |
|------|------|------|
| Cookie/Wskey 抓取 | rewrite 重写 | 打开京东 App 时自动抓取 `pt_key`+`pt_pin`+`wskey`，推送 ntfy 并同步 BoxJs |
| 积分换话费 | task 定时任务 | 京东「首页-赚话费」自动签到做任务，移植自 [6dylan6/jdpro](https://github.com/6dylan6/jdpro) 的 `jd_dwapp.js`（青龙版），经打包管线转换为圈X 单文件脚本 |

## 快速开始

### 1. 添加任务订阅（推荐：画廊式）

圈X → 风车 → **任务** → 右上角 `+` → 粘贴（添加为"任务订阅"，可整体一键开启/关闭）：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/tasks/qx-jd-tasks.json
```

> 或用资源订阅方式（含 Cookie 抓包重写，一次导入全套）：
> ```
> https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/jd_scripts.conf
> ```

> 若 MITM 证书未配置过：圈X → 设置 → MITM → 生成证书 → 安装并信任证书。

### 2. 添加 BoxJs 订阅（可选，用于查看/手动配置）

圈X → BoxJs（或浏览器打开 boxjs.com / boxjs.net）→ 订阅 → 添加：

```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/boxjs/qx-jd.boxjs.json
```

### 3. 获取 Cookie（二选一）

- **自动（推荐）**：保持圈X 运行，打开京东 App 随便逛逛（触发 `api.m.jd.com` 请求即可）。抓包脚本会自动把 Cookie 写入 BoxJs 的 `CookiesJD`，任务脚本直接读取，无需手动复制。多账号自动按 `pt_pin` 去重更新。
- **手动**：BoxJs → 京东脚本 → 积分换话费 → 在 `CookieJD` 填写 `pt_key=xxx;pt_pin=xxx;`。
  ⚠️ 同一账号不要同时在 `CookiesJD` 和 `CookieJD` 里配置，会重复执行。

### 4. 运行

到点自动运行；也可在圈X → 风车 → 任务 中手动触发「积分换话费」查看日志。

## 仓库结构

```
├── jd_scripts.conf          # 圈X 资源订阅（rewrite + task + mitm）
├── qx_jd_all.js             # Cookie/Wskey 抓取（频率控制 + ntfy + BoxJs 同步）
├── qx_jd_cookie.js          # 旧版 Cookie 抓取（保留）
├── qx_jd_wskey.js           # 旧版 Wskey 抓取（保留）
├── boxjs/
│   └── qx-jd.boxjs.json     # BoxJs 订阅
├── tasks/
│   └── qx-jd-tasks.json     # 圈X 任务画廊订阅（fmz200 同款格式）
├── scripts/
│   └── jd_dwapp.qx.js       # 积分换话费打包产物（自动生成，勿手改）
├── src/
│   └── prelude.js           # 圈X 兼容层（CommonJS/process/crypto/got/axios 垫片）
└── tools/
    ├── build.js             # 打包管线：上游青龙脚本 → 圈X 单文件
    └── smoke-test.js        # Node 模拟圈X 环境的冒烟测试
```

## 移植原理（给好奇的人）

青龙脚本跑在 Node.js 上，圈X 是 JavaScriptCore 沙箱：无 `require`、无 Node 内置模块。
本仓库的做法是 `src/prelude.js` 在圈X 里重建了一个最小 Node 兼容层：

- **CommonJS 注册表**：把上游混淆依赖（`dylib/dyland/dylanx/dylans`）和 `crypto-js` 原样包成惰性模块；
- **垫片**：`process`/`path`/`Buffer`/`crypto`（用 crypto-js 实现）、`got`/`axios` 子集（桥接到 `$task.fetch`）；
- **桩**：`https`/`https-proxy-agent`/`fs`/`tough-cookie`/青龙专属的 `sendNotify`/`jdCookie`/`proxy.js`（圈X 分支不会执行，防御性提供）。

主脚本内嵌的 `Env` 类本身就支持圈X，打包时只需保证 `typeof module === 'undefined'`，
脚本就会走它原生维护的圈X 代码分支（`$task.fetch` 发请求、`$prefs` 读 Cookie、`$notify` 通知）。

## 更新上游

上游 jdpro 更新后（京东签名 h5st 会不定期失效，上游会跟进），重新打包：

```bash
PROXY=http://192.168.0.235:7890 node tools/build.js --refresh
node tools/smoke-test.js   # 冒烟测试
```

然后 commit + push，圈X 端无需任何操作（每次运行拉取最新脚本）。

## 免责声明

- 仅供学习交流，请于下载后 24 小时内删除，勿用于商业用途。
- 使用本脚本产生的任何账号风险（包括但不限于黑号、封号）由使用者自行承担。
- 脚本 Cookie 仅存储在你本机圈X 的 BoxJs 中；ntfy 推送频道为你自己配置的私有频道，请注意勿泄露频道名。

## 致谢

- 上游脚本：[6dylan6/jdpro](https://github.com/6dylan6/jdpro)
- 跨平台 Env 设计：chavyleung / lxk0301 等前辈
- 图标：[Orz-3/mini](https://github.com/Orz-3/mini)
