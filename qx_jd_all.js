/**
 * 京东 Cookie + 设备指纹 + Wskey 抓取 (Quantumult X) - 去重 + 推送锁版
 *
 * 圈X 重写: ^https?://(api\.m\.jd\.com|sh\.jd\.com)/ → script-request-body
 *   （必须 body 钩子：uuid/eid/机型 在请求体里，script-request-header 抓不到 body）
 *
 * 抓取两类：
 *   1) 短 Cookie（pt_key+pt_pin）→ 同步到 BoxJs CookiesJD，供本机圈X任务脚本读取
 *   2) 完整设备指纹整行 → 推 ntfy → 235 青龙 JD_COOKIE，供 JDOOOK 读取
 *      完整行 = pt_key;pt_pin;User-Agent(含 ep 整段不裁);uuid;x-api-eid-token;wg-sdk-token;
 *               d_brand;d_model;osVersion;build;screen;clientVersion;partner;area;lng;lat
 *
 * 设备字段来自三处（逐请求合并缓存，凑齐后才推）：
 *   - UA 头：完整 jdapp;…（ep 段不裁）
 *   - 请求体 urlencoded 顶层：uuid/eid/wg/d_brand/d_model/osVersion/build/clientVersion/area/screen/partner
 *   - Referer 或 body 的 tttparams（base64 JSON）：area/lng/lat
 *
 * 推送配置: 在 BoxJs 设置 JD_NTFY_TOPIC（如 "HzjHy2codes"），推 https://ntfy.sh/<topic>
 *          不配置则仅 BoxJs 本地存储
 */

// ==================== ntfy topic ====================
function getNtfyUrl() {
  try {
    if (typeof $prefs !== "undefined") {
      const topic = $prefs.valueForKey("JD_NTFY_TOPIC");
      if (topic && topic !== "false" && topic !== "") return "https://ntfy.sh/" + topic.trim();
    }
  } catch (_) {}
  return null;
}

// ==================== BoxJs 短 Cookie 同步（本机圈X任务用，保持 pt_key+pt_pin 短格式） ====================
function syncCookiesJD(pin, ckLine) {
  if (!pin || !ckLine) return;
  var raw = "[]";
  try { if (typeof $prefs !== "undefined") raw = $prefs.valueForKey("CookiesJD") || "[]"; } catch (_) {}
  var arr; try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var hit = false;
  for (var i = 0; i < arr.length; i++) {
    var c = (arr[i] && arr[i].cookie) || "";
    if (c.indexOf("pt_pin=" + pin + ";") >= 0 || c.indexOf("pt_pin=" + encodeURIComponent(pin) + ";") >= 0) {
      arr[i].cookie = ckLine; hit = true; break;
    }
  }
  if (!hit) arr.push({ cookie: ckLine });
  try { if (typeof $prefs !== "undefined") $prefs.setValueForKey(JSON.stringify(arr), "CookiesJD"); } catch (_) {}
}

function syncCookiesWS(pin, wsLine) {
  if (!wsLine) return;
  var raw = "[]";
  try { if (typeof $prefs !== "undefined") raw = $prefs.valueForKey("CookiesJD") || "[]"; } catch (_) {}
  var arr; try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var wsVal = (wsLine.match(/wskey=([^;]+)/) || [])[1] || "";
  var hit = false, i = 0, encPin = encodeURIComponent(pin || "");
  for (; i < arr.length; i++) {
    var c = (arr[i] && arr[i].cookie) || "";
    var ew = (arr[i] && arr[i].wskey) || "";
    var byPin = pin && (c.indexOf("pt_pin=" + pin + ";") >= 0 || c.indexOf("pt_pin=" + encPin + ";") >= 0);
    var byWs = wsVal && ew.indexOf(wsVal) >= 0;
    if (byPin || byWs) { if (typeof arr[i] === "object") arr[i].wskey = wsLine; hit = true; break; }
  }
  if (!hit) arr.push({ cookie: "", wskey: wsLine });
  try { if (typeof $prefs !== "undefined") $prefs.setValueForKey(JSON.stringify(arr), "CookiesJD"); } catch (_) {}
}

// ==================== 兼容层 ====================
function pget(key) {
  try { if (typeof $prefs !== "undefined") { var v = $prefs.valueForKey(key); if (v != null) return v; } } catch (_) {}
  try { if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || ""; } catch (_) {}
  return "";
}
function pset(value, key) {
  try { if (typeof $prefs !== "undefined") { $prefs.setValueForKey(value, key); return; } } catch (_) {}
  try { if (typeof $persistentStore !== "undefined") { $persistentStore.write(value, key); return; } } catch (_) {}
}
function nowMs() { return Date.now ? Date.now() : new Date().getTime(); }
function doNotify(title, subtitle, msg) {
  try { if (typeof $notify !== "undefined") { $notify(title, subtitle, msg); return; } } catch (_) {}
  try { if (typeof $notification !== "undefined") { $notification.post(title, subtitle, msg); return; } } catch (_) {}
}
function log(s) { console.log("[JD] " + s); }

// ==================== 字段采集（移植自 jd_qinglong_cookie_format.js，UA 不裁） ====================
function hdr(headers, name) {
  if (!headers) return "";
  var want = String(name).toLowerCase();
  for (var k in headers) if (String(k).toLowerCase() === want) return String(headers[k] == null ? "" : headers[k]);
  return "";
}
function dec(v) {
  if (v == null) return "";
  v = String(v);
  if (v.indexOf("%") < 0) return v;
  try { return decodeURIComponent(v); } catch (e) { return v; }
}
function cval(cookie, key) {
  if (!cookie) return "";
  var want = String(key).toLowerCase();
  var parts = String(cookie).split(";");
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i].replace(/^\s+|\s+$/g, ""), eq = s.indexOf("=");
    if (eq > 0 && s.slice(0, eq).replace(/^\s+|\s+$/g, "").toLowerCase() === want)
      return s.slice(eq + 1).replace(/^\s+|\s+$/g, "").replace(/^["']|["']$/g, "");
  }
  return "";
}
function params(text) {
  var out = {}, parts = String(text || "").split("&");
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    var eq = parts[i].indexOf("=");
    var k = dec(eq < 0 ? parts[i] : parts[i].slice(0, eq)).replace(/^\s+|\s+$/g, "");
    if (k) out[k] = dec(eq < 0 ? "" : parts[i].slice(eq + 1));
  }
  return out;
}
function flat(obj, out, depth) {
  if (!obj || typeof obj !== "object" || depth > 3) return out;
  for (var k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    var v = obj[k];
    if (v && typeof v === "object") flat(v, out, depth + 1);
    else if (v != null && (out[k] == null || out[k] === "")) out[k] = String(v);
  }
  return out;
}
function bodyFields(body) {
  var out = {};
  if (body == null || body === "") return out;
  var t = String(body).replace(/^\s+|\s+$/g, "");
  if (t.charAt(0) === "{" || t.charAt(0) === "[") { try { flat(JSON.parse(t), out, 0); } catch (e) {} return out; }
  out = params(t);
  var inner = String(out.body || "").replace(/^\s+|\s+$/g, "");
  if (inner.charAt(0) === "{" || inner.charAt(0) === "[") { try { flat(JSON.parse(inner), out, 0); } catch (e) {} }
  return out;
}
function lower(o) { var m = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) m[String(k).toLowerCase()] = o[k]; return m; }
function hostOf(url) { var m = String(url || "").match(/^[a-z]+:\/\/([^\/:?#]+)/i); return m ? m[1].toLowerCase() : ""; }

// tttparams: 前缀不定的 base64，eyJ 先对齐 4 字符边界，rstrip =，取 {…}，裁掉被干扰码弄坏的尾字段（JDOOOK _ttt_json 同款）
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(s) {
  var o = "", b = 0, n = 0;
  for (var i = 0; i < s.length; i++) {
    var v = B64.indexOf(s.charAt(i)); if (v < 0) continue;
    b = (b << 6) | v; n += 6;
    if (n >= 8) { n -= 8; o += String.fromCharCode((b >> n) & 255); }
  }
  return o;
}
function tttJson(raw) {
  raw = dec(raw);
  var marker = raw.indexOf("eyJ");
  if (marker < 0) return null;
  if (marker > 0) raw = raw.slice(marker % 4);
  raw = raw.replace(/=+$/, "");
  var s = b64decode(raw);
  var start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  var text = s.slice(start, end + 1);
  for (var i = 0; i < 4; i++) {
    try { var j = JSON.parse(text); if (typeof j === "object") return j; }
    catch (e) { var cut = text.lastIndexOf(","); if (cut <= 0) return null; text = text.slice(0, cut) + "}"; }
  }
  return null;
}
function tttValues(text) {
  var m = String(text || "").match(/tttparams=([^&#\s]+)/);
  if (!m) return {};
  var j = tttJson(m[1]);
  if (!j) return {};
  var out = {};
  if (j.gps_area) out.area = String(j.gps_area);
  else if (j.un_area) out.area = String(j.un_area);
  else if (j.lbsArea) out.area = String(j.lbsArea);
  else if (j.area) out.area = String(j.area);
  if (j.lng) out.lng = String(j.lng);
  if (j.lat) out.lat = String(j.lat);
  return out;
}

// 校验规则与 JDOOOK account_common 一致（密文/假值会被剔掉）
function valid(key, v) {
  v = String(v || "");
  if (!v) return false;
  if (key === "uuid") return /^(?:[0-9a-fA-F]{32,40}|\d{8,24}-\d{8,24})$/.test(v);
  if (key === "eid") return v.indexOf("jdd") === 0 && v.length >= 100 && v.length <= 400;
  if (key === "wg") return v.indexOf("jdd01") === 0 && v.length >= 100;
  if (key === "d_brand") return /^[A-Za-z0-9 ._-]{2,20}$/.test(v);
  if (key === "d_model") return /^[A-Za-z0-9 .,_-]{2,24}$/.test(v);
  if (key === "osVersion") return /^\d+(?:\.\d+){0,2}$/.test(v);
  if (key === "build") return /^\d{5,8}$/.test(v);
  if (key === "clientVersion") return /^\d+(?:\.\d+){1,3}$/.test(v);
  if (key === "area") return /^\d{1,4}(?:_\d{1,7}){2,3}$/.test(v);
  if (key === "lng" || key === "lat") return /^-?\d{1,3}\.\d+$/.test(v);
  if (key === "screen") return /^\d{2,5}[*x]\d{2,5}$/.test(v);
  if (key === "partner") return /^[A-Za-z0-9._-]{1,32}$/.test(v);
  return true;
}
var ALIAS = {
  uuid: ["uuid"],
  eid: ["x-api-eid-token"],
  wg: ["wg-sdk-token"],
  d_brand: ["d_brand"],
  d_model: ["d_model"],
  osVersion: ["osVersion", "os_version"],
  build: ["build"],
  clientVersion: ["clientVersion", "client_version"],
  area: ["area", "un_area", "gps_area"],
  lng: ["lng", "longitude"],
  lat: ["lat", "latitude"],
  screen: ["screen"],
  partner: ["partner"]
};
var KEYS = ["uuid", "eid", "wg", "d_brand", "d_model", "osVersion", "build", "clientVersion", "area", "lng", "lat", "screen", "partner"];
function pick(key, raw) {
  var v = dec(raw).replace(/^\s+|\s+$/g, "").replace(/^["']|["']$/g, "");
  if (!v || v.indexOf("cipher") >= 0 || v.charAt(0) === "{" || v.indexOf("R4iS") === 0) return ""; // R4iS = 京东密文前缀
  return valid(key, v) ? v : "";
}

function collect(req) {
  var headers = (req && req.headers) || {};
  var body = (req && req.body) || "";
  var cookie = hdr(headers, "Cookie");
  var urlStr = (req && req.url) || "";
  var q = lower(params(String(urlStr).split("?")[1] || ""));
  var b = lower(bodyFields(body));
  var h = lower(headers);
  var pin = cval(cookie, "pt_pin") || cval(cookie, "pin");

  var f = {
    pt_key: cval(cookie, "pt_key"),
    pt_pin: cval(cookie, "pt_pin"),
    "User-Agent": hdr(headers, "User-Agent")
  };

  for (var i = 0; i < KEYS.length; i++) {
    var key = KEYS[i], v = "", names = ALIAS[key];
    for (var j = 0; j < names.length && !v; j++) {
      var n = names[j].toLowerCase();
      v = pick(key, h[n]) || pick(key, q[n]) || pick(key, b[n]) || pick(key, cval(cookie, n));
    }
    if (v) f[key] = v;
  }

  // 定位：先请求体/Referer 明文 area/lng/lat，没有再解 tttparams
  if (!f.lng || !f.lat || !f.area) {
    var t = tttValues(hdr(headers, "Referer")) || tttValues(body) || {};
    if (!f.area && t.area) f.area = pick("area", t.area);
    if (!f.lng && t.lng) f.lng = pick("lng", t.lng);
    if (!f.lat && t.lat) f.lat = pick("lat", t.lat);
  }

  // 本条 UA 不是 jdapp（心跳/SDK 请求）时，用跨请求缓存里存过的 jdapp UA 顶替。
  // build/clientVersion 永远能从 jdapp UA 取（第 3 段是 App 版本、appBuild 是 build）。
  // osVersion/d_brand 只在缓存里也没有时才从 UA 兜底（明文 osVersion 只在个别请求出现，
  // 其余全密文 R4iS…；d_brand 明文只有 bff 请求一条）。
  var ua = (f["User-Agent"] || "").replace(/^\s+|\s+$/g, "");
  if (ua.indexOf("jdapp;") !== 0 && pin) {
    var c0 = loadDev(pin).ua || "";
    if (c0.indexOf("jdapp;") === 0) ua = c0;
  }
  if (ua.indexOf("jdapp;") === 0) {
    f["User-Agent"] = ua;
    if (!f.build) { var bm = ua.match(/appBuild\/(\d{5,8})/); if (bm) f.build = bm[1]; }
    if (!f.clientVersion) { var cm = ua.match(/^jdapp;iPhone;([^;]+);/); if (cm && valid("clientVersion", cm[1])) f.clientVersion = cm[1]; }
    var dev0 = pin ? loadDev(pin) : {};
    if (!f.osVersion && !dev0.osVersion) { var om = ua.match(/iPhone OS (\d+)_/); if (om) f.osVersion = om[1] + ".0"; }
    if (!f.d_brand && !dev0.d_brand && ua.indexOf("jdapp;iPhone;") === 0) f.d_brand = "iPhone";
  }
  return f;
}

// ==================== 跨请求合并缓存（per-pin） ====================
var DEV_PREFIX = "jd_dev_";
function loadDev(pin) { try { return JSON.parse(pget(DEV_PREFIX + pin) || "{}") || {}; } catch (e) { return {}; } }
function saveDev(pin, d) { pset(JSON.stringify(d), DEV_PREFIX + pin); }
function mergeDev(pin, f) {
  var dev = loadDev(pin), changed = false;
  // uuid 变了说明换设备/换号，清缓存避免串号
  if (f.uuid && dev.uuid && f.uuid !== dev.uuid) { dev = {}; changed = true; }
  for (var i = 0; i < KEYS.length; i++) {
    var k = KEYS[i];
    if (f[k] && f[k] !== dev[k]) { dev[k] = f[k]; changed = true; }
  }
  var ua = (f["User-Agent"] || "").replace(/^\s+|\s+$/g, "");
  if (ua.indexOf("jdapp;") === 0 && ua !== dev.ua) { dev.ua = ua; changed = true; }
  if (changed) saveDev(pin, dev);
  // 合并后回填本次
  for (var j = 0; j < KEYS.length; j++) if (!f[KEYS[j]] && dev[KEYS[j]]) f[KEYS[j]] = dev[KEYS[j]];
  if (!f["User-Agent"] && dev.ua) f["User-Agent"] = dev.ua;
  return f;
}

// 拼 JDOOOK 能直接吃的整行（字段名/顺序按 account_common._device_fields 解析规则）
function composeFull(f) {
  var out = [];
  var add = function (name, v) { v = String(v || "").replace(/^\s+|\s+$/g, ""); if (v) out.push(name + "=" + v); };
  add("pt_key", f.pt_key);
  add("pt_pin", f.pt_pin);
  // UA 整段不裁（含 ep）；UA 自身以 ; 结尾，正好做分隔
  add("User-Agent", f["User-Agent"]);
  add("uuid", f.uuid);
  add("x-api-eid-token", f.eid);
  add("wg-sdk-token", f.wg);
  add("d_brand", f.d_brand);
  add("d_model", f.d_model);
  add("osVersion", f.osVersion);
  add("build", f.build);
  add("screen", f.screen);
  add("clientVersion", f.clientVersion);
  add("partner", f.partner);
  add("area", f.area);
  add("lng", f.lng);
  add("lat", f.lat);
  return out.join(";") + ";";
}
// JDOOOK REQUIRED 字段（缺这些账号会被跳过）。d_brand 只在心跳请求里出现，
// 所以要等跨请求缓存凑齐才推整行；wg-sdk-token 是 CONDITIONAL，只 wegame/金融/捕鱼线才有，不卡。
function missingFull(f) {
  var m = [];
  if ((f["User-Agent"] || "").indexOf("jdapp;") !== 0) m.push("User-Agent");
  if (!f.uuid) m.push("uuid");
  if (!f.eid) m.push("x-api-eid-token");
  if (!f.d_brand) m.push("d_brand");
  if (!f.d_model) m.push("d_model");
  if (!f.osVersion) m.push("osVersion");
  if (!f.build) m.push("build");
  if (!f.clientVersion) m.push("clientVersion");
  return m;
}
function isFullLine(line) {
  return /(?:^|;)(user-agent|uuid|x-api-eid-token|wg-sdk-token|d_brand|d_model|osversion|clientversion|build|screen)=/i.test(line);
}
function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); }

// ==================== ntfy 异步推送 ====================
var pending = 0, ntfyUrl = null;
function checkDone() { pending--; if (pending <= 0) $done({}); }
function pushNtfy(body, title) {
  if (!ntfyUrl) return;
  pending++;
  var done = false, timer = setTimeout(function () { finish(false, "timeout 8s"); }, 8000);
  function finish(ok, info) {
    if (done) return; done = true;
    if (timer) try { clearTimeout(timer); } catch (_) {}
    log(ok ? ("推送成功: " + title) : ("推送失败: " + info));
    checkDone();
  }
  var opts = { url: ntfyUrl, headers: { "Content-Type": "text/plain", "Title": title }, body: body };
  if (typeof $httpClient !== "undefined" && $httpClient.post) {
    try {
      $httpClient.post(opts, function (error, response) {
        var code = response && response.statusCode ? response.statusCode : 0;
        finish(!error && code >= 200 && code < 300, error || ("HTTP " + code));
      });
      return;
    } catch (e) {}
  }
  try {
    if (typeof $task !== "undefined" && $task.fetch) {
      $task.fetch(Object.assign({ method: "POST" }, opts)).then(
        function () { finish(true, ""); },
        function (e) { finish(false, e ? (e.error || JSON.stringify(e)) : "unknown"); }
      );
      return;
    }
  } catch (e) {}
  log("无可用 HTTP API，跳过 " + title);
  if (timer) try { clearTimeout(timer); } catch (_) {}
  checkDone();
}

// ==================== 主逻辑 ====================
(function main() {
  var req = typeof $request !== "undefined" ? $request : {};
  var cookie = (req.headers && (req.headers["Cookie"] || req.headers["cookie"])) || "";
  var ptPin = (cookie.match(/pt_pin=([^;]+)/) || [])[1] || "";
  var ptKey = (cookie.match(/pt_key=([^;]+)/) || [])[1] || "";
  var rawPin = (cookie.match(/(?:^|;\s*)pin=([^;]+)/) || [])[1] || "";
  var wskey = (cookie.match(/wskey=([^;]+)/) || [])[1] || "";
  var pin = ptPin || rawPin;

  log("pin=" + (pin || "?") + " pt_key=" + (ptKey ? "有" : "无") + " wskey=" + (wskey ? "有" : "无"));
  if (!pin) { $done({}); return; }

  // BoxJs 短 Cookie 始终同步（本机圈X任务用）
  if (ptKey && ptPin) syncCookiesJD(pin, "pt_key=" + ptKey + ";pt_pin=" + pin + ";");

  // 设备指纹：采集 + 跨请求合并
  var f = mergeDev(pin, collect(req));

  var needCk = false, needWs = false, ckLine = "", wsLine = "", wp = "";

  // 决定推什么：设备指纹 REQUIRED 字段凑齐就推完整行，否则先推短 Cookie
  // （235 端不会把完整行降级成短行；短行到 235 后 JDOOOK 会跳过，等完整行来再补）
  var ua = (f["User-Agent"] || "").replace(/^\s+|\s+$/g, "");
  var miss = missingFull(f);
  var isFull = ua.indexOf("jdapp;") === 0 && miss.length === 0;
  if (ptKey && ptPin) {
    if (isFull) {
      ckLine = composeFull(f);
    } else {
      if (ua.indexOf("jdapp;") === 0) log("设备指纹未齐，暂推短CK，等齐再推完整行：" + miss.join(","));
      ckLine = "pt_key=" + ptKey + ";pt_pin=" + pin + ";";
    }
    var now1 = nowMs(), ckLock = parseInt(pget("jd_cklock_" + pin)) || 0;
    var sig = hash(ckLine);
    var lastSig = pget("jd_devsig_" + pin);
    // 完整行内容没变就不重复推（省 ntfy 流量，235 还有 10 分钟去重）
    if (isFull && sig === lastSig) {
      log("完整指纹未变化，跳过: " + pin);
    } else if (now1 - ckLock > 30000) {
      pset(String(now1), "jd_cklock_" + pin);
      pset(sig, "jd_devsig_" + pin);
      needCk = true;
      doNotify("JD 设备指纹", pin, isFull ? "完整行 " + ckLine.length + "B" : "短 Cookie");
      log((isFull ? "推送完整指纹" : "推送短CK") + ": " + pin);
    } else {
      log("推送锁内(30s)，跳过: " + pin);
    }
  }

  if (wskey) {
    wp = pin || "unknown";
    wsLine = "pin=" + wp + ";wskey=" + wskey + ";";
    syncCookiesWS(wp, wsLine);
    var wsLock = parseInt(pget("jd_wslock_" + wp)) || 0;
    var now2 = nowMs();
    if (now2 - wsLock > 30000) {
      pset(String(now2), "jd_wslock_" + wp);
      needWs = true;
      doNotify("JD WSKEY", wp, "wskey=" + wskey.substring(0, 30) + "...");
      log("推送 wskey: " + wp);
    } else {
      log("wskey 推送锁内(30s)，跳过: " + wp);
    }
  }

  if (!needCk && !needWs) { $done({}); return; }

  ntfyUrl = getNtfyUrl();
  if (!ntfyUrl) { log("未配置 JD_NTFY_TOPIC，仅 BoxJs 本地存储"); $done({}); return; }

  if (needCk) pushNtfy(ckLine, (isFull ? "JD_device_" : "JD_cookie_") + pin);
  if (needWs) pushNtfy(wsLine, "JD_wskey_" + wp);
})();
