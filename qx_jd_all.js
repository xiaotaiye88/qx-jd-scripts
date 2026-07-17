/**
 * 京东 Cookie + Wskey 抓取 (Quantumult X) - 带频率控制
 *
 * 圈X 重写: ^https?://api\.m\.jd\.com/ → script-request-header
 *
 * 频率控制: 同账号每 RATE_LIMIT_MS 毫秒只推送一次，默认 1 分钟
 */

// ============ 频率控制（毫秒） ============
const RATE_LIMIT_MS = 60000; // 改为 300000 = 5分钟, 3600000 = 1小时

// ============ ntfy 推送地址 ============
const NTFY_URL = "https://ntfy.sh/HzjHy2codes";

// ============ 兼容层：$persistentStore / $prefs ============
function pget(key) {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || "0";
  } catch (_) {}
  try {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key) || "0";
  } catch (_) {}
  return "0";
}
function pset(value, key) {
  try {
    if (typeof $persistentStore !== "undefined") { $persistentStore.write(value, key); return; }
  } catch (_) {}
  try {
    if (typeof $prefs !== "undefined") { $prefs.setValueForKey(value, key); return; }
  } catch (_) {}
}
function nowMs() { return Date.now ? Date.now() : new Date().getTime(); }

const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";

if (!cookie) {
  $done({});
}

// 提取
const ptPin = (cookie.match(/pt_pin=([^;]+)/) || [])[1] || "";
const ptKey = (cookie.match(/pt_key=([^;]+)/) || [])[1] || "";
const rawPin = (cookie.match(/(?:^|;\s*)pin=([^;]+)/) || [])[1] || "";
const wskey = (cookie.match(/wskey=([^;]+)/) || [])[1] || "";

const pin = ptPin || rawPin;

console.log("[JD] pin=" + (pin || "?") + " pt_key=" + (ptKey ? "有" : "无") + " wskey=" + (wskey ? "有" : "无"));

// ============ pt_key cookie 处理 ============
if (pin && ptKey) {
  const storeKey = "jd_ck_" + pin;
  const last = parseInt(pget(storeKey));

  if (nowMs() - last > RATE_LIMIT_MS) {
    pset(String(nowMs()), storeKey);

    const cookieLine = "pt_key=" + ptKey + ";pt_pin=" + pin + ";";

    $httpClient.post(
      {
        url: NTFY_URL,
        headers: { "Content-Type": "text/plain", Title: "JD_cookie_" + pin },
        body: cookieLine,
      },
      function () {}
    );

    $notification.post("JD Cookie", pin, ptKey.substring(0, 30) + "...");
    console.log("[JD-CK] 已推送: " + pin);
  } else {
    console.log("[JD-CK] 频率限制, " + pin);
  }
}

// ============ wskey 处理 ============
if (wskey) {
  const wskeyPin = pin || "unknown";
  const storeKey = "jd_ws_" + wskeyPin + "_" + wskey.substring(0, 16);
  const last = parseInt(pget(storeKey));

  if (nowMs() - last > RATE_LIMIT_MS) {
    pset(String(nowMs()), storeKey);

    const wskeyLine = "pin=" + wskeyPin + ";wskey=" + wskey + ";";

    $httpClient.post(
      {
        url: NTFY_URL,
        headers: { "Content-Type": "text/plain", Title: "JD_wskey_" + wskeyPin },
        body: wskeyLine,
      },
      function () {}
    );

    $notification.post("JD WSKEY", wskeyPin, "wskey=" + wskey.substring(0, 30) + "...");
    console.log("[JD-WS] 已推送: " + wskeyPin);
  } else {
    console.log("[JD-WS] 频率限制, " + wskeyPin);
  }
}

$done({});
