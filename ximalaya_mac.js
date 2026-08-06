/*
 *
 *
脚本功能：喜马拉雅 Mac 客户端 (Electron) 会员解锁适配
原理：Mac 客户端走 PC 接口 (www.ximalaya.com/mobile-playpage/track/v3/baseInfo
      和 pc.ximalaya.com/simple-revision-for-pc/play/v1/audio)，
      ximalaya.js 只支持 iOS 接口 (mobile-playpage/track/v4)。
      本脚本动态加载 ximalaya.js 作为解析引擎，内部构造 iOS v4 格式请求
      触发其完整解析流程（下载共享会员 Cookie → 请求 pay 接口 → CryptoJS 解密
      fileId → 构造带签名的真实播放 URL），再把解析出的 URL 改写进 Mac 端响应。
运行环境：Quantumult X (Mac)
使用方式（在 default.conf 中添加）：
[rewrite_local]
# Mac 客户端 v3 播放接口
^https?:\/\/www\.ximalaya\.com\/mobile-playpage\/track\/v3\/baseInfo url script-response-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
# Mac 客户端 pc 音频解析接口
^https?:\/\/pc\.ximalaya\.com\/simple-revision-for-pc\/play\/v1\/audio url script-response-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
[mitm]
hostname = www.ximalaya.com, pc.ximalaya.com, *.ximalaya.com, *.xmcdn.com
 *
 *
*/

// ============ 配置 ============
const XIMALAYA_ENGINE_URL = "https://raw.githubusercontent.com/WeiGiegie/666/main/ximalaya.js";

// ============ 网络层（快照原始 $task，避免与引擎环境冲突） ============
// QX 脚本启动时 $task 是 QX 提供的最底层网络接口，先快照下来
var ORIG_TASK = (typeof $task !== "undefined") ? $task : null;
var ORIG_HTTPCLIENT = (typeof $httpClient !== "undefined") ? $httpClient : null;

function netGet(url, headers) {
  return new Promise(function (resolve) {
    var optHeaders = {};
    if (headers) {
      for (var k in headers) optHeaders[k] = headers[k];
    }
    if (!optHeaders["User-Agent"]) optHeaders["User-Agent"] = "Mozilla/5.0";

    if (ORIG_TASK) {
      ORIG_TASK.fetch({ url: url, method: "GET", headers: optHeaders }).then(function (resp) {
        resolve({
          status: resp.statusCode || resp.status || 200,
          body: resp.body || "",
          headers: resp.headers || {},
          bodyBytes: resp.bodyBytes || null
        });
      }, function (err) {
        resolve({ status: 0, body: "", error: err && err.error || err });
      });
    } else if (ORIG_HTTPCLIENT) {
      ORIG_HTTPCLIENT.get({ url: url, headers: optHeaders }, function (err, resp, body) {
        if (err) resolve({ status: 0, body: "", error: err });
        else resolve({ status: resp && (resp.status || resp.statusCode), body: body || "", headers: resp && resp.headers || {} });
      });
    } else {
      resolve({ status: 0, body: "", error: "No HTTP client" });
    }
  });
}

// ============ ximalaya.js 解析引擎 ============
var engineCode = null;
var enginePromise = null;

// 下载并缓存 ximalaya.js 引擎代码
function getEngineCode() {
  if (engineCode) return Promise.resolve(engineCode);
  if (enginePromise) return enginePromise;
  enginePromise = netGet(XIMALAYA_ENGINE_URL).then(function (resp) {
    if (!resp.body || resp.body.length < 10000) {
      console.log("【喜马拉雅Mac】引擎下载失败");
      return null;
    }
    var idx = resp.body.indexOf("const $ = new Env");
    if (idx < 0) {
      console.log("【喜马拉雅Mac】引擎格式异常");
      return null;
    }
    engineCode = resp.body.slice(idx);
    return engineCode;
  });
  return enginePromise;
}

// 从引擎输出提取播放 URL
function extractUrl(captured) {
  try {
    var d = JSON.parse(captured.body);
    if (d.playUrlInfos && d.playUrlInfos.length > 0) {
      return d.playUrlInfos[0].url;
    }
    if (d.trackBaseVO && d.trackBaseVO.playUrl && d.trackBaseVO.playUrl.url) {
      return d.trackBaseVO.playUrl.url;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 用 ximalaya.js 引擎解析指定 trackId 的音频地址
function resolveWithEngine(trackId) {
  return getEngineCode().then(function (code) {
    if (!code) return null;
    return new Promise(function (resolve) {
      var captured = null;
      var done = false;

      // 构造 iOS v4 请求上下文（引擎按 URL 路由到音频解析分支）
      var fakeRequest = {
        url: "https://mobile.ximalaya.com/mobile-playpage/track/v4/baseInfo/ts?device=ios&trackId=" + trackId + "&ts=" + Date.now(),
        headers: { "User-Agent": "ting_8.0.0_ios_20250609" }
      };
      var fakeResponse = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ret: 0, data: { trackInfo: { trackId: Number(trackId), isPaid: true, isVipPaid: true } } })
      };

      // 保存原有全局（QX 的 JavaScriptCore 没有 global 对象，直接引用全局变量）
      var origRequest = $request, origResponse = $response;
      var origDone = $done, origPrefs = $prefs, origNotify = $notify;
      var origTask = $task;

      // 覆盖为引擎需要的环境（直接给全局变量赋值，QX 非严格模式下生效）
      try {
        $request = fakeRequest;
        $response = fakeResponse;
        $done = function (o) { captured = o; };
        $prefs = { valueForKey: function () { return null; }, setValueForKey: function () { return true; } };
        $notify = function () {};
        console.log("【喜马拉雅Mac】引擎环境已设置");
      } catch (e) {
        console.log("【喜马拉雅Mac】设置引擎环境失败:", e.message);
        cleanup();
        resolve(null);
        return;
      }

      // 引擎发起的网络请求：直接用快照的 ORIG_TASK，绝不再经过 netGet(避免递归)
      var engineTask = { fetch: function (o) {
        var url = (typeof o === "string") ? o : o.url;
        var headers = (typeof o === "object" && o.headers) ? o.headers : {};
        var optHeaders = {};
        for (var k in headers) optHeaders[k] = headers[k];
        if (!optHeaders["User-Agent"]) optHeaders["User-Agent"] = "Mozilla/5.0";
        var p;
        if (ORIG_TASK) {
          p = ORIG_TASK.fetch({ url: url, method: "GET", headers: optHeaders });
        } else if (ORIG_HTTPCLIENT) {
          p = new Promise(function (res) {
            ORIG_HTTPCLIENT.get({ url: url, headers: optHeaders }, function (err, resp, body) {
              if (err) res({ statusCode: 0, status: 0, headers: {}, body: "", bodyBytes: null });
              else res({ statusCode: resp && (resp.status || resp.statusCode), status: resp && (resp.status || resp.statusCode), headers: resp && resp.headers || {}, body: body || "", bodyBytes: resp && resp.bodyBytes || null });
            });
          });
        } else {
          p = Promise.resolve({ statusCode: 0, status: 0, headers: {}, body: "", bodyBytes: null });
        }
        return p.then(function (r) {
          return { statusCode: r.statusCode, status: r.status, headers: r.headers || {}, body: r.body || "", bodyBytes: r.bodyBytes || null };
        });
      }};
      $task = engineTask;

      function cleanup() {
        if (done) return;
        done = true;
        $request = origRequest;
        $response = origResponse;
        $done = origDone;
        $prefs = origPrefs;
        $notify = origNotify;
        $task = origTask;
      }

      // 超时保护
      var timer = setTimeout(function () {
        cleanup();
        resolve(captured ? extractUrl(captured) : null);
      }, 25000);

      // 执行引擎
      try {
        // 关键: 引擎 getEnv() 通过 "typeof module !== undefined" 判断 Node 环境。
        // QX (JavaScriptCore) 里 module 是全局对象，会导致引擎误判为 Node 环境
        // 从而走 require('fs') 分支静默中断。这里把 module 覆盖为 undefined 强制走 QX 分支。
        console.log("【喜马拉雅Mac】开始执行引擎, 代码长度:", code.length);
        var fn = new Function("module", "require", "module = undefined; try { " + code + " } catch(e) { console.log('引擎异常:', e && e.message); }");
        fn(undefined, function (name) { throw new Error("no module " + name); });
        console.log("【喜马拉雅Mac】引擎已启动, 等待异步解析...");
      } catch (e) {
        console.log("【喜马拉雅Mac】引擎执行异常:", e.message);
        cleanup();
        clearTimeout(timer);
        resolve(null);
        return;
      }

      // 轮询等待引擎完成（引擎是异步的，$done 会在解析完成后被调用）
      var poll = setInterval(function () {
        if (captured) {
          clearInterval(poll);
          clearTimeout(timer);
          var url = extractUrl(captured);
          cleanup();
          resolve(url);
        }
      }, 300);
      // poll 在 cleanup 后可能残留，由 done 标志 + 内部检查兜底
    });
  });
}

// ============ 响应改写 ============

// 改写 www.ximalaya.com/mobile-playpage/track/v3/baseInfo 响应
function rewriteV3BaseInfo(body, audioUrl, trackId) {
  var d;
  try { d = JSON.parse(body); } catch (e) { d = {}; }

  // 从 URL 提取 trackId（v3 路径格式: /track/v3/baseInfo/{ts}?trackId=xxx）
  if (!trackId) {
    var m = (body || "").match(/trackId["\s:=]+(\d+)/);
    if (m) trackId = m[1];
  }
  var tid = Number(trackId) || 0;

  // 关键: Mac 客户端请求 v3/baseInfo 时如果未登录/无权限, 服务器返回 {ret:1001,"系统繁忙"}
  // 这种错误响应没有 data.trackInfo, 直接改字段无效。需要构造完整成功响应。
  var isErrResp = (d.ret && d.ret !== 0 && d.ret !== 200) || (!d.data && !d.trackInfo);
  if (isErrResp) {
    d = {
      ret: 0,
      msg: "success",
      data: {
        trackInfo: {
          trackId: tid,
          isPaid: false,
          isVipFree: true,
          canPlay: true,
          isAuthorized: true,
          isFree: true,
          vipInfo: { isVip: true, vipStatus: 1 }
        }
      }
    };
  }

  var targets = [];
  if (d.data && d.data.trackInfo) targets.push(d.data.trackInfo);
  if (d.trackInfo) targets.push(d.trackInfo);
  for (var i = 0; i < targets.length; i++) {
    var ti = targets[i];
    ti.isPaid = false;
    ti.isVipFree = true;
    ti.canPlay = true;
    ti.isAuthorized = true;
    ti.isFree = true;
    ti.vipInfo = ti.vipInfo || {};
    ti.vipInfo.isVip = true;
    ti.vipInfo.vipStatus = 1;
    if (audioUrl) {
      ti.playUrl = { url: audioUrl, ts: Date.now(), size: 0 };
      if (d.data) d.data.playUrl = { url: audioUrl, ts: Date.now() };
    }
  }
  return JSON.stringify(d);
}

// 改写 pc.ximalaya.com/simple-revision-for-pc/track/simple 响应
// 这是 Mac 客户端判断"付费内容"的主要依据: isPaid:true + isAuthorized:false → 显示付费提示
function rewriteTrackSimple(body) {
  try {
    var d = JSON.parse(body);
    // track/simple 响应: { ret:200, data: { trackInfo: { isPaid, isAuthorized, ... } } }
    var targets = [];
    if (d.data && d.data.trackInfo) targets.push(d.data.trackInfo);
    if (d.data && d.data.albumInfo) targets.push(d.data.albumInfo);
    if (d.trackInfo) targets.push(d.trackInfo);
    for (var i = 0; i < targets.length; i++) {
      var ti = targets[i];
      ti.isPaid = false;
      ti.isAuthorized = true;
      ti.isFree = true;
      ti.isVipFree = true;
      ti.canPlay = true;
      ti.hasBuy = true;
      ti.isOwn = true;
      ti.paidSoundType = 0;
      ti.priceType = 0;
      if ("price" in ti) ti.price = "0";
      if ("discountedPrice" in ti) ti.discountedPrice = "0";
    }
    return JSON.stringify(d);
  } catch (e) {
    return body;
  }
}

// 改写 pc.ximalaya.com/simple-revision-for-pc/play/v1/audio 响应
function rewritePlayV1Audio(body, audioUrl) {
  try {
    var d = JSON.parse(body);
    if (d.data) {
      d.data.canPlay = true;
      d.data.isPaid = false;
      d.data.hasBuy = true;
      d.data.isVipFree = true;
      d.data.sampleDuration = 0;
      d.data.firstPlayStatus = false;
      // audioUrl === "__KEEP_ORIG_SRC__" 表示保留服务器原返回的 src(已经可播放)
      if (audioUrl && audioUrl !== "__KEEP_ORIG_SRC__") {
        d.data.src = audioUrl;
        d.data.playUrl = audioUrl;
      }
      // 确保 playUrl 和 src 一致
      if (d.data.src && !d.data.playUrl) d.data.playUrl = d.data.src;
    }
    return JSON.stringify(d);
  } catch (e) {
    return body;
  }
}

// ============ 主入口 ============
// ============ 主入口 ============
// 共享账号数据源(多源回退): 主源 xmly_data.json, 备源 himalaya_data.json, 再备 himalaya_cookie.json
var SHARED_DATA_URLS = [
  "https://raw.githubusercontent.com/WeiGiegie/666/main/xmly_data.json",
  "https://raw.githubusercontent.com/WeiGiegie/666/main/himalaya_data.json",
  "https://raw.githubusercontent.com/WeiGiegie/666/main/himalaya_cookie.json"
];

// 依次尝试各数据源, 返回第一个含有效 cookie 的
function fetchCookieFromSources() {
  var idx = 0;
  function tryNext() {
    if (idx >= SHARED_DATA_URLS.length) return Promise.resolve(null);
    var url = SHARED_DATA_URLS[idx];
    idx++;
    return netGet(url).then(function (resp) {
      var cookie = "";
      try {
        var d = JSON.parse(resp.body || "{}");
        cookie = d.cookie || "";
      } catch (e) {}
      if (cookie) {
        console.log("【喜马拉雅Mac】Cookie 来自:", url.split("/").pop());
        return cookie;
      }
      return tryNext();
    }).catch(function () { return tryNext(); });
  }
  return tryNext();
}

// 请求头注入处理(script-request-header): 给请求注入共享会员 Cookie
function handleRequestHeader() {
  var url = ($request && $request.url) || "";
  console.log("【喜马拉雅Mac】[请求] URL:", url.slice(0, 100));
  fetchCookieFromSources().then(function (cookie) {
    if (!cookie) { console.log("【喜马拉雅Mac】[请求] 无Cookie, 放行"); $done({}); return; }
    var headers = ($request && $request.headers) || {};
    headers["Cookie"] = cookie;
    console.log("【喜马拉雅Mac】[请求] 已注入共享Cookie");
    $done({ headers: headers });
  }).catch(function (e) { console.log("【喜马拉雅Mac】[请求] 异常:", e.message); $done({}); });
}

function main() {
  // 区分调用方式: script-request-header 只有 $request, 没有 $response
  if (typeof $response === "undefined" || !$response) {
    handleRequestHeader();
    return;
  }
  var url = $request.url || "";
  console.log("【喜马拉雅Mac】开始, URL:", url.slice(0, 130));

  // 提取 trackId
  var trackId = null;
  var m = url.match(/[?&](?:trackId|id)=(\d+)/);
  if (m) trackId = m[1];

  var doRewrite = function (audioUrl) {
    var newBody = $response.body || "";
    if (url.indexOf("track/v3/baseInfo") > -1) {
      newBody = rewriteV3BaseInfo($response.body, audioUrl, trackId);
    } else if (url.indexOf("play/v1/audio") > -1) {
      newBody = rewritePlayV1Audio($response.body, audioUrl);
    } else if (url.indexOf("track/simple") > -1 || url.indexOf("track/detail") > -1) {
      newBody = rewriteTrackSimple($response.body);
    }
    if (audioUrl && audioUrl !== "__KEEP_ORIG_SRC__" && typeof $notify !== "undefined") {
      try { $notify("喜马拉雅Mac", "解析成功", "TrackId: " + trackId); } catch (e) {}
    }
    $done({ body: newBody });
  };

  // 关键策略:
  // - track/simple: Mac 客户端判断"付费内容"的主要依据(isPaid/isAuthorized), 直接改字段, 不解析
  // - v3/baseInfo: 服务器返回 ret:1001 错误, 构造成功响应让播放器继续, 不解析(避免超时)
  // - play/v1/audio: 先看原始响应是否已有可播放 src, 有则保留, 无才用引擎解析
  var isV3 = url.indexOf("track/v3/baseInfo") > -1;
  var isPlay = url.indexOf("play/v1/audio") > -1;
  var isTrackSimple = url.indexOf("track/simple") > -1 || url.indexOf("track/detail") > -1;

  if (isTrackSimple) {
    // track 信息接口: 直接改付费状态字段, 不解析(这个接口决定是否显示"付费内容")
    console.log("【喜马拉雅Mac】track 信息接口, 改写付费状态");
    doRewrite(null);
  } else if (isV3) {
    // v3 接口: 直接构造成功响应, 不解析(避免超时)
    console.log("【喜马拉雅Mac】v3/baseInfo 接口, 构造可播放响应");
    doRewrite(null);
  } else if (isPlay && trackId) {
    // play/v1/audio: 先看原始响应是否已有可播放 src
    var origPlayable = false;
    var origSrc = "";
    try {
      var origD = JSON.parse($response.body || "{}");
      origSrc = (origD.data && origD.data.src) ? origD.data.src : "";
      console.log("【喜马拉雅Mac】原始响应 src 长度:", origSrc.length, "| canPlay:", origD.data && origD.data.canPlay);
      if (origSrc.indexOf("http") === 0) {
        origPlayable = true;
        console.log("【喜马拉雅Mac】原始响应已含可播放 src, 直接改字段保留 src");
      }
    } catch (e) {
      console.log("【喜马拉雅Mac】解析原始响应失败:", e.message, "| body前100:", ($response.body || "").slice(0, 100));
    }
    if (origPlayable) {
      // 保留原 src, 只改字段
      doRewrite("__KEEP_ORIG_SRC__");
    } else {
      // 原 src 为空: 先查缓存, 有则直接填入; 无则引擎解析并缓存
      var cacheKey = "ximalaya_mac_src_" + trackId;
      var cachedUrl = "";
      try { cachedUrl = $prefs.valueForKey(cacheKey) || ""; } catch (e) {}
      if (cachedUrl && cachedUrl.indexOf("http") === 0) {
        console.log("【喜马拉雅Mac】命中缓存 src, TrackId:", trackId);
        doRewrite(cachedUrl);
        return;
      }
      // 引擎解析(带超时保护: 8秒内必须 $done)
      console.log("【喜马拉雅Mac】解析音频, TrackId:", trackId);
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        console.log("【喜马拉雅Mac】解析超时, 返回原响应(下次播放会命中缓存)");
        doRewrite(null);
      }, 8000);
      resolveWithEngine(trackId).then(function (audioUrl) {
        if (timedOut) return; // 已经超时返回了
        clearTimeout(timer);
        if (audioUrl) {
          console.log("【喜马拉雅Mac】解析成功:", audioUrl.slice(0, 100));
          // 缓存 URL(有效期较短, 签名 URL 有时效)
          try { $prefs.setValueForKey(audioUrl, cacheKey); } catch (e) {}
        } else {
          console.log("【喜马拉雅Mac】解析失败, TrackId:", trackId);
        }
        doRewrite(audioUrl);
      }).catch(function (e) {
        if (timedOut) return;
        clearTimeout(timer);
        console.log("【喜马拉雅Mac】异常:", e && e.message);
        doRewrite(null);
      });
    }
  } else {
    doRewrite(null);
  }
}

main();
