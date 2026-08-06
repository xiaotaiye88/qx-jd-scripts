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

      // 保存原有全局
      var origRequest = global.$request, origResponse = global.$response;
      var origDone = global.$done, origPrefs = global.$prefs, origNotify = global.$notify;
      var origTask = global.$task;

      // 覆盖为引擎需要的环境
      global.$request = fakeRequest;
      global.$response = fakeResponse;
      global.$done = function (o) { captured = o; };
      global.$prefs = { valueForKey: function () { return null; }, setValueForKey: function () { return true; } };
      global.$notify = function () {};

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
      global.$task = engineTask;

      function cleanup() {
        if (done) return;
        done = true;
        global.$request = origRequest;
        global.$response = origResponse;
        global.$done = origDone;
        global.$prefs = origPrefs;
        global.$notify = origNotify;
        global.$task = origTask;
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
        var fn = new Function("module", "require", "module = undefined; try { " + code + " } catch(e) { console.log('引擎异常:', e && e.message); }");
        fn(undefined, function (name) { throw new Error("no module " + name); });
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
function rewriteV3BaseInfo(body, audioUrl) {
  try {
    var d = JSON.parse(body);
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
      if (audioUrl) {
        d.data.src = audioUrl;
        d.data.playUrl = audioUrl;
      }
    }
    return JSON.stringify(d);
  } catch (e) {
    return body;
  }
}

// ============ 主入口 ============
function main() {
  var url = $request.url || "";
  console.log("【喜马拉雅Mac】开始, URL:", url.slice(0, 130));

  // 提取 trackId
  var trackId = null;
  var m = url.match(/[?&](?:trackId|id)=(\d+)/);
  if (m) trackId = m[1];

  var doRewrite = function (audioUrl) {
    var newBody = $response.body || "";
    if (url.indexOf("track/v3/baseInfo") > -1) {
      newBody = rewriteV3BaseInfo($response.body, audioUrl);
    } else if (url.indexOf("play/v1/audio") > -1) {
      newBody = rewritePlayV1Audio($response.body, audioUrl);
    }
    if (audioUrl && typeof $notify !== "undefined") {
      try { $notify("喜马拉雅Mac", "解析成功", "TrackId: " + trackId); } catch (e) {}
    }
    $done({ body: newBody });
  };

  if (trackId) {
    console.log("【喜马拉雅Mac】解析音频, TrackId:", trackId);
    resolveWithEngine(trackId).then(function (audioUrl) {
      if (audioUrl) {
        console.log("【喜马拉雅Mac】解析成功:", audioUrl.slice(0, 100));
      } else {
        console.log("【喜马拉雅Mac】解析失败, TrackId:", trackId);
      }
      doRewrite(audioUrl);
    }).catch(function (e) {
      console.log("【喜马拉雅Mac】异常:", e && e.message);
      doRewrite(null);
    });
  } else {
    doRewrite(null);
  }
}

main();
