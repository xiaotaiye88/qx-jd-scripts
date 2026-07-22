/**
 * 京东 Cookie + Wskey 抓取 (Quantumult X) - 去重 + 推送锁版
 *
 * 圈X 重写: ^https?://api\.m\.jd\.com/ → script-request-header
 * 去重: Cookie/Wskey 内容没变就不推；同账号 10 秒推送锁挡住一次操作的并发请求
 * 附加: 抓到的 pt_key+pt_pin 自动 upsert 到 BoxJs 键 CookiesJD，供任务脚本读取
 *
 * 推送配置: 在 BoxJs 设置 JD_NTFY_TOPIC（如 "mytopic"），脚本会推送到 https://ntfy.sh/mytopic
 *          不配置则仅 BoxJs 本地存储，不外推
 */

// 从 BoxJs 读取 ntfy topic（不配置则不推送）
function getNtfyUrl() {
  try {
    if (typeof $prefs !== "undefined") {
      const topic = $prefs.valueForKey("JD_NTFY_TOPIC");
      if (topic && topic !== "false" && topic !== "") {
        return "https://ntfy.sh/" + topic.trim();
      }
    }
  } catch (_) {}
  return null;
}

// ============ BoxJs 同步：CookiesJD（任务脚本的多账号来源） ============
function syncCookiesJD(pin, ckLine) {
  if (!pin || !ckLine) return;
  var raw = "[]";
  try {
    if (typeof $prefs !== "undefined") raw = $prefs.valueForKey("CookiesJD") || "[]";
  } catch (_) {}
  var arr;
  try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var hit = false;
  for (var i = 0; i < arr.length; i++) {
    var c = (arr[i] && arr[i].cookie) || "";
    if (c.indexOf("pt_pin=" + pin + ";") >= 0 || c.indexOf("pt_pin=" + encodeURIComponent(pin) + ";") >= 0) {
      arr[i].cookie = ckLine;
      hit = true;
      break;
    }
  }
  if (!hit) arr.push({ cookie: ckLine });
  try {
    if (typeof $prefs !== "undefined") $prefs.setValueForKey(JSON.stringify(arr), "CookiesJD");
    console.log("[JD] BoxJs CookiesJD 已同步: " + pin + (hit ? "(更新)" : "(新增)"));
  } catch (_) {}
}

// ============ BoxJs wskey 同步（与 CookiesJD 同一条目，识别方式：pin → wskey 值） ============
function syncCookiesWS(pin, wsLine) {
  if (!wsLine) return;
  var raw = "[]";
  try { if (typeof $prefs !== "undefined") raw = $prefs.valueForKey("CookiesJD") || "[]"; } catch (_) {}
  var arr;
  try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var wsVal = (wsLine.match(/wskey=([^;]+)/) || [])[1] || "";
  var hit = false, i = 0;
  var encPin = encodeURIComponent(pin || "");
  for (; i < arr.length; i++) {
    var c = (arr[i] && arr[i].cookie) || "";
    var ew = (arr[i] && arr[i].wskey) || "";
    // 匹配方式1: 按 pt_pin 匹配已有条目
    var byPin = pin && (c.indexOf("pt_pin=" + pin + ";") >= 0 || c.indexOf("pt_pin=" + encPin + ";") >= 0);
    // 匹配方式2: 按 wskey 值匹配（即使 pin 为空也能合到同一账号）
    var byWs = wsVal && ew.indexOf(wsVal) >= 0;
    if (byPin || byWs) {
      if (typeof arr[i] === "object") arr[i].wskey = wsLine;
      hit = true; break;
    }
  }
  if (!hit) arr.push({ cookie: "", wskey: wsLine });
  try {
    if (typeof $prefs !== "undefined") $prefs.setValueForKey(JSON.stringify(arr), "CookiesJD");
    console.log("[JD] BoxJs wskey 已同步: " + (pin || "?") + (hit ? "(更新)" : "(新增)"));
  } catch (_) {}
}

// ============ 兼容层 ============
function pget(key) {
  try {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key) || "0";
  } catch (_) {}
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || "0";
  } catch (_) {}
  return "0";
}
function pset(value, key) {
  try {
    if (typeof $prefs !== "undefined") { $prefs.setValueForKey(value, key); return; }
  } catch (_) {}
  try {
    if (typeof $persistentStore !== "undefined") { $persistentStore.write(value, key); return; }
  } catch (_) {}
}
function nowMs() { return Date.now ? Date.now() : new Date().getTime(); }

function doNotify(title, subtitle, msg) {
  try {
    if (typeof $notify !== "undefined") { $notify(title, subtitle, msg); return; }
  } catch (_) {}
  try {
    if (typeof $notification !== "undefined") { $notification.post(title, subtitle, msg); return; }
  } catch (_) {}
}

// ============ 主逻辑 ============
const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";
const ptPin = (cookie.match(/pt_pin=([^;]+)/) || [])[1] || "";
const ptKey = (cookie.match(/pt_key=([^;]+)/) || [])[1] || "";
const rawPin = (cookie.match(/(?:^|;\s*)pin=([^;]+)/) || [])[1] || "";
const wskey = (cookie.match(/wskey=([^;]+)/) || [])[1] || "";
const pin = ptPin || rawPin;

console.log("[JD] pin=" + (pin || "?") + " pt_key=" + (ptKey ? "有" : "无") + " wskey=" + (wskey ? "有" : "无"));

var needPushCk = false, needPushWs = false;
var ckLine = "", wsLine = "", wp = "";

if (pin && ptKey) {
  var fullCk = "pt_key=" + ptKey + ";pt_pin=" + pin + ";";
  syncCookiesJD(pin, fullCk);  // BoxJs 始终同步最新 Cookie（不受推送锁影响）
  // 内容去重 + 推送锁：Cookie 没变就不推；同账号 10 秒内只推 1 次（挡住一次操作的并发请求）
  var ckSig = ptKey;
  var lastCkSig = pget("jd_cksig_" + pin);
  var now1 = nowMs();
  var ckLock = parseInt(pget("jd_cklock_" + pin)) || 0;
  if (lastCkSig !== ckSig && now1 - ckLock > 10000) {
    pset(String(now1), "jd_cklock_" + pin);  // 先抢锁，后续并发请求读到新锁即跳过
    pset(ckSig, "jd_cksig_" + pin);
    ckLine = fullCk;
    needPushCk = true;
    doNotify("JD Cookie", pin, ptKey.substring(0, 30) + "...");
    console.log("[JD-CK] Cookie 变化, 推送: " + pin);
  } else if (lastCkSig === ckSig) {
    console.log("[JD-CK] Cookie 未变化, 跳过: " + pin);
  } else {
    console.log("[JD-CK] 推送锁内, 跳过: " + pin);
  }
}

if (wskey) {
  wp = pin || "unknown";
  wsLine = "pin=" + wp + ";wskey=" + wskey + ";";
  syncCookiesWS(wp, wsLine);  // BoxJs 始终同步最新 wskey（不受推送锁影响）
  var wsSig = wskey.substring(0, 16);
  var lastWsSig = pget("jd_wssig_" + wp);
  var now2 = nowMs();
  var wsLock = parseInt(pget("jd_wslock_" + wp)) || 0;
  if (lastWsSig !== wsSig && now2 - wsLock > 10000) {
    pset(String(now2), "jd_wslock_" + wp);
    pset(wsSig, "jd_wssig_" + wp);
    needPushWs = true;
    doNotify("JD WSKEY", wp, "wskey=" + wskey.substring(0, 30) + "...");
    console.log("[JD-WS] Wskey 变化, 推送: " + wp);
  } else if (lastWsSig === wsSig) {
    console.log("[JD-WS] Wskey 未变化, 跳过: " + wp);
  } else {
    console.log("[JD-WS] 推送锁内, 跳过: " + wp);
  }
}

// 没需要推送的直接结束
if (!needPushCk && !needPushWs) {
  $done({});
}

// 检查是否配置了 ntfy
const ntfyUrl = getNtfyUrl();
if (!ntfyUrl) {
  console.log("[JD] 未配置 JD_NTFY_TOPIC，仅 BoxJs 本地存储");
  $done({});
}

// 有推送需求，用 $task.fetch 异步发，完成后 $done
var pending = 0;
function checkDone() {
  pending--;
  if (pending <= 0) $done({});
}

function pushNtfy(body, title) {
  pending++;
  var done = false;
  var timer = setTimeout(function () { finish(false, "timeout 8s"); }, 8000);
  function finish(ok, info) {
    if (done) return;
    done = true;
    if (timer) { try { clearTimeout(timer); } catch (_) {} }
    console.log(ok ? "[NTFY] 推送成功: " + title : "[NTFY] 推送失败: " + info);
    checkDone();
  }
  var opts = { url: ntfyUrl, headers: { "Content-Type": "text/plain", "Title": title }, body: body };
  // 优先 $httpClient（重写阶段可靠，失败只回调一次，不会触发 "Retry too many times"）
  if (typeof $httpClient !== "undefined" && $httpClient.post) {
    try {
      $httpClient.post(opts, function (error, response) {
        var code = response && response.statusCode ? response.statusCode : 0;
        finish(!error && code >= 200 && code < 300, error || ("HTTP " + code));
      });
      return;
    } catch (e) {
      console.log("[NTFY] $httpClient异常: " + e);
    }
  }
  // 回退 $task.fetch
  try {
    if (typeof $task !== "undefined" && $task.fetch) {
      $task.fetch(Object.assign({ method: "POST" }, opts)).then(
        function () { finish(true, ""); },
        function (e) { finish(false, e ? (e.error || JSON.stringify(e)) : "unknown"); }
      );
      return;
    }
  } catch (e) {
    console.log("[NTFY] $task.fetch异常: " + e);
  }
  console.log("[NTFY] 无可用 HTTP API，跳过");
  if (timer) { try { clearTimeout(timer); } catch (_) {} }
  checkDone();
}

if (needPushCk) pushNtfy(ckLine, "JD_cookie_" + pin);
if (needPushWs) pushNtfy(wsLine, "JD_wskey_" + wp);
