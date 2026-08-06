/*
 *
 *
脚本功能：喜马拉雅 Mac 客户端 (Electron) 会员解锁适配
原理：Mac 客户端走 PC 接口，请求时不带会员 Cookie 导致服务器返回空 src。
      本脚本在请求发出前注入共享会员 Cookie(script-request-header)，
      让服务器直接返回可播放的音频 URL，响应即时无需解析。
      同时改写 track/simple 等接口的付费状态字段。
运行环境：Quantumult X (Mac)
使用方式（在 default.conf 中添加）：
[rewrite_local]
# 请求头注入共享会员 Cookie(核心: 让服务器直接返回可播放src)
^https?:\/\/pc\.ximalaya\.com\/simple-revision-for-pc\/play\/v1\/audio url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
^https?:\/\/www\.ximalaya\.com\/mobile-playpage\/track\/v3\/baseInfo url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
# 响应改写
^https?:\/\/pc\.ximalaya\.com\/simple-revision-for-pc\/track\/simple url script-response-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
^https?:\/\/www\.ximalaya\.com\/mobile-playpage\/track\/v3\/baseInfo url script-response-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
^https?:\/\/pc\.ximalaya\.com\/simple-revision-for-pc\/play\/v1\/audio url script-response-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/ximalaya_mac.js
[mitm]
hostname = www.ximalaya.com, pc.ximalaya.com, *.ximalaya.com, *.xmcdn.com
 *
 *
*/

// ============ 配置 ============
var SHARED_DATA_URL = "https://raw.githubusercontent.com/WeiGiegie/666/main/xmly_data.json";
var XIMALAYA_ENGINE_URL = "https://raw.githubusercontent.com/WeiGiegie/666/main/ximalaya.js";
var DEBUG = true;

function log() { if (DEBUG) console.log.apply(console, arguments); }

// ============ 网络层 ============
var ORIG_TASK = (typeof $task !== "undefined") ? $task : null;
var ORIG_HTTPCLIENT = (typeof $httpClient !== "undefined") ? $httpClient : null;

function netGet(url, headers) {
  return new Promise(function (resolve) {
    var h = { "User-Agent": "Mozilla/5.0" };
    if (headers) for (var k in headers) h[k] = headers[k];
    if (ORIG_TASK) {
      ORIG_TASK.fetch({ url: url, method: "GET", headers: h }).then(function (resp) {
        resolve({ status: resp.statusCode || resp.status || 200, body: resp.body || "", headers: resp.headers || {} });
      }, function (err) { resolve({ status: 0, body: "", error: err }); });
    } else if (ORIG_HTTPCLIENT) {
      ORIG_HTTPCLIENT.get({ url: url, headers: h }, function (err, resp, body) {
        if (err) resolve({ status: 0, body: "", error: err });
        else resolve({ status: resp && (resp.status || resp.statusCode), body: body || "", headers: resp && resp.headers || {} });
      });
    } else { resolve({ status: 0, body: "", error: "No HTTP" }); }
  });
}

// ============ 共享 Cookie 管理 ============
var cachedCookie = null;
var cookiePromise = null;
var cookieExpire = 0;

function getSharedCookie() {
  // 缓存 1 小时
  if (cachedCookie && Date.now() < cookieExpire) return Promise.resolve(cachedCookie);
  if (cookiePromise) return cookiePromise;
  cookiePromise = netGet(SHARED_DATA_URL).then(function (resp) {
    cookiePromise = null;
    if (!resp.body) { log("【喜马拉雅Mac】共享Cookie下载失败"); return null; }
    try {
      var d = JSON.parse(resp.body);
      cachedCookie = d.cookie || "";
      cookieExpire = Date.now() + 3600000;
      log("【喜马拉雅Mac】共享Cookie已更新, 长度:", cachedCookie.length);
      return cachedCookie;
    } catch (e) { log("【喜马拉雅Mac】Cookie解析失败:", e.message); return null; }
  });
  return cookiePromise;
}

// ============ 请求头注入(script-request-header) ============
// 核心逻辑: 在请求发出前, 给请求注入共享会员 Cookie
// 这样服务器直接返回带 src 的可播放响应, 无需慢速解析
function handleRequestHeader() {
  var url = ($request && $request.url) || "";
  log("【喜马拉雅Mac】[请求] URL:", url.slice(0, 100));

  getSharedCookie().then(function (cookie) {
    if (!cookie) {
      log("【喜马拉雅Mac】无Cookie, 放行请求");
      $done({});
      return;
    }
    // 注入 Cookie 到请求头(保留原有字段, 合并 Cookie)
    var headers = ($request && $request.headers) || {};
    // 直接覆盖 Cookie(共享会员身份优先)
    headers["Cookie"] = cookie;
    log("【喜马拉雅Mac】[请求] 已注入共享Cookie");
    $done({ headers: headers });
  }).catch(function (e) {
    log("【喜马拉雅Mac】[请求] 异常:", e && e.message);
    $done({});
  });
}

// ============ 响应改写(script-response-body) ============

// 改写 track/simple: isPaid/isAuthorized(付费内容提示来源)
function rewriteTrackSimple(body) {
  try {
    var d = JSON.parse(body);
    var targets = [];
    if (d.data && d.data.trackInfo) targets.push(d.data.trackInfo);
    if (d.data && d.data.albumInfo) targets.push(d.data.albumInfo);
    if (d.trackInfo) targets.push(d.trackInfo);
    for (var i = 0; i < targets.length; i++) {
      var ti = targets[i];
      ti.isPaid = false; ti.isAuthorized = true; ti.isFree = true;
      ti.isVipFree = true; ti.canPlay = true; ti.hasBuy = true; ti.isOwn = true;
      ti.paidSoundType = 0; ti.priceType = 0;
      if ("price" in ti) ti.price = "0";
      if ("discountedPrice" in ti) ti.discountedPrice = "0";
    }
    return JSON.stringify(d);
  } catch (e) { return body; }
}

// 改写 v3/baseInfo: 错误响应(1001)时构造成功响应
function rewriteV3BaseInfo(body, audioUrl, trackId) {
  var d;
  try { d = JSON.parse(body); } catch (e) { d = {}; }
  if (!trackId) { var m = ($request.url || "").match(/[?&]trackId=(\d+)/); if (m) trackId = m[1]; }
  var tid = Number(trackId) || 0;
  var isErr = (d.ret && d.ret !== 0 && d.ret !== 200) || (!d.data && !d.trackInfo);
  if (isErr) {
    d = { ret: 0, msg: "success", data: { trackInfo: { trackId: tid, isPaid: false, isVipFree: true, canPlay: true, isAuthorized: true, isFree: true, vipInfo: { isVip: true, vipStatus: 1 } } } };
  }
  var targets = [];
  if (d.data && d.data.trackInfo) targets.push(d.data.trackInfo);
  if (d.trackInfo) targets.push(d.trackInfo);
  for (var i = 0; i < targets.length; i++) {
    var ti = targets[i];
    ti.isPaid = false; ti.isVipFree = true; ti.canPlay = true; ti.isAuthorized = true; ti.isFree = true;
    ti.vipInfo = ti.vipInfo || {}; ti.vipInfo.isVip = true; ti.vipInfo.vipStatus = 1;
    if (audioUrl) { ti.playUrl = { url: audioUrl, ts: Date.now(), size: 0 }; if (d.data) d.data.playUrl = { url: audioUrl, ts: Date.now() }; }
  }
  return JSON.stringify(d);
}

// 改写 play/v1/audio: 确保字段正确, 保留 src
function rewritePlayV1Audio(body) {
  try {
    var d = JSON.parse(body);
    if (d.data) {
      d.data.canPlay = true; d.data.isPaid = false; d.data.hasBuy = true;
      d.data.isVipFree = true; d.data.sampleDuration = 0; d.data.firstPlayStatus = false;
      if (d.data.src && !d.data.playUrl) d.data.playUrl = d.data.src;
    }
    return JSON.stringify(d);
  } catch (e) { return body; }
}

function handleResponseBody() {
  var url = ($request && $request.url) || "";
  log("【喜马拉雅Mac】[响应] URL:", url.slice(0, 100));

  var origSrc = "";
  try { var od = JSON.parse($response.body || "{}"); origSrc = (od.data && od.data.src) ? od.data.src : ""; } catch (e) {}
  log("【喜马拉雅Mac】[响应] 原始src长度:", origSrc.length);

  var newBody = $response.body || "";
  if (url.indexOf("track/simple") > -1) {
    log("【喜马拉雅Mac】[响应] 改写 track/simple 付费状态");
    newBody = rewriteTrackSimple($response.body);
  } else if (url.indexOf("track/v3/baseInfo") > -1) {
    log("【喜马拉雅Mac】[响应] 改写 v3/baseInfo");
    newBody = rewriteV3BaseInfo($response.body, origSrc);
  } else if (url.indexOf("play/v1/audio") > -1) {
    log("【喜马拉雅Mac】[响应] 改写 play/v1/audio 字段");
    newBody = rewritePlayV1Audio($response.body);
  }
  $done({ body: newBody });
}

// ============ 主入口: 根据脚本类型分发 ============
// QX 调用脚本时会设置 $scriptType 或通过请求/响应特征判断
// script-request-header: 只有 $request, 没有 $response
// script-response-body: 有 $response
(function () {
  var hasResponse = (typeof $response !== "undefined") && $response;
  if (hasResponse) {
    handleResponseBody();
  } else {
    handleRequestHeader();
  }
})();
