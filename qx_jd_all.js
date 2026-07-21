/**
 * 京东 Cookie + Wskey 抓取 (Quantumult X) - 频率控制版
 *
 * 圈X 重写: ^https?://api\.m\.jd\.com/ → script-request-header
 * 频率: 同账号每分钟最多推送1次
 * 附加: 抓到的 pt_key+pt_pin 自动 upsert 到 BoxJs 键 CookiesJD，供任务脚本读取
 */

const RATE_LIMIT_MS = 60000;

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
    // pt_pin 可能是 URL 编码的，两种形态都比对
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
  // 不受频率限制：BoxJs 始终保存最新 Cookie，供任务脚本（如积分换话费）使用
  syncCookiesJD(pin, fullCk);
  var lastCk = parseInt(pget("jd_ck_" + pin));
  if (nowMs() - lastCk > RATE_LIMIT_MS) {
    pset(String(nowMs()), "jd_ck_" + pin);
    ckLine = fullCk;
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

// 有推送需求，本地通知即可
$done({});
