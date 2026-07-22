/*
 * wskey→pt_key 转换（Quantumult X 原生版）
 * cron: 57 21,9 * * *
 *
 * 读取 BoxJs CookiesJD 数组中有 wskey 的条目，
 * 调用京东 genToken + appjmp 接口换出新的 pt_key，
 * 自动更新回 CookiesJD。
 *
 * 需要先在 qx_jd_all.js 中配置 BoxJs 的 JD_NTFY_TOPIC（可选），
 * 或本脚本运行时会本地通知转换结果。
 */

// ============================== MD5 实现（标准版） ==============================
var md5 = function () {
  var hex_chr = "0123456789abcdef";
  function rhex(n) { var s = "", j; for (j = 0; j < 4; j++) s += hex_chr.charAt((n >> (j * 8 + 4)) & 15) + hex_chr.charAt((n >> (j * 8)) & 15); return s; }
  function str2blks(s) { var nblk = ((s.length + 8) >> 6) + 1, blks = [], i; for (i = 0; i < nblk * 16; i++) blks[i] = 0; for (i = 0; i < s.length; i++) blks[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8); blks[i >> 2] |= 0x80 << ((i % 4) * 8); blks[nblk * 16 - 2] = s.length * 8; return blks; }
  function add(x, y) { var lsw = (x & 0xFFFF) + (y & 0xFFFF), msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xFFFF); }
  function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
  function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  return function (s) {
    var x = str2blks(s), a = 1732584193, b = -271733879, c = -1732584194, d = 271733878, olda, oldb, oldc, oldd, i;
    for (i = 0; i < x.length; i += 16) {
      olda = a; oldb = b; oldc = c; oldd = d;
      a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i+1], 12, -389564586); c = ff(c, d, a, b, x[i+2], 17, 606105819); b = ff(b, c, d, a, x[i+3], 22, -1044525330);
      a = ff(a, b, c, d, x[i+4], 7, -176418897); d = ff(d, a, b, c, x[i+5], 12, 1200080426); c = ff(c, d, a, b, x[i+6], 17, -1473231341); b = ff(b, c, d, a, x[i+7], 22, -45705983);
      a = ff(a, b, c, d, x[i+8], 7, 1770035416); d = ff(d, a, b, c, x[i+9], 12, -1958414417); c = ff(c, d, a, b, x[i+10], 17, -42063); b = ff(b, c, d, a, x[i+11], 22, -1990404162);
      a = ff(a, b, c, d, x[i+12], 7, 1804603682); d = ff(d, a, b, c, x[i+13], 12, -40341101); c = ff(c, d, a, b, x[i+14], 17, -1502002290); b = ff(b, c, d, a, x[i+15], 22, 1236535329);
      a = gg(a, b, c, d, x[i+1], 5, -165796510); d = gg(d, a, b, c, x[i+6], 9, -1069501632); c = gg(c, d, a, b, x[i+11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
      a = gg(a, b, c, d, x[i+5], 5, -701558691); d = gg(d, a, b, c, x[i+10], 9, 38016083); c = gg(c, d, a, b, x[i+15], 14, -660478335); b = gg(b, c, d, a, x[i+4], 20, -405537848);
      a = gg(a, b, c, d, x[i+9], 5, 568446438); d = gg(d, a, b, c, x[i+14], 9, -1019803690); c = gg(c, d, a, b, x[i+3], 14, -187363961); b = gg(b, c, d, a, x[i+8], 20, 1163531501);
      a = gg(a, b, c, d, x[i+13], 5, -1444681467); d = gg(d, a, b, c, x[i+2], 9, -51403784); c = gg(c, d, a, b, x[i+7], 14, 1735328473); b = gg(b, c, d, a, x[i+12], 20, -1926607734);
      a = hh(a, b, c, d, x[i+5], 4, -378558); d = hh(d, a, b, c, x[i+8], 11, -2022574463); c = hh(c, d, a, b, x[i+11], 16, 1839030562); b = hh(b, c, d, a, x[i+14], 23, -35309556);
      a = hh(a, b, c, d, x[i+1], 4, -1530992060); d = hh(d, a, b, c, x[i+4], 11, 1272893353); c = hh(c, d, a, b, x[i+7], 16, -155497632); b = hh(b, c, d, a, x[i+10], 23, -1094730640);
      a = hh(a, b, c, d, x[i+13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i+3], 16, -722521979); b = hh(b, c, d, a, x[i+6], 23, 76029189);
      a = hh(a, b, c, d, x[i+9], 4, -640364487); d = hh(d, a, b, c, x[i+12], 11, -421815835); c = hh(c, d, a, b, x[i+15], 16, 530742520); b = hh(b, c, d, a, x[i+2], 23, -995338651);
      a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i+7], 10, 1126891415); c = ii(c, d, a, b, x[i+14], 15, -1416354905); b = ii(b, c, d, a, x[i+5], 21, -57434055);
      a = ii(a, b, c, d, x[i+12], 6, 1700485571); d = ii(d, a, b, c, x[i+3], 10, -1894986606); c = ii(c, d, a, b, x[i+10], 15, -1051523); b = ii(b, c, d, a, x[i+1], 21, -2054922799);
      a = ii(a, b, c, d, x[i+8], 6, 1873313359); d = ii(d, a, b, c, x[i+15], 10, -30611744); c = ii(c, d, a, b, x[i+6], 15, -1560198380); b = ii(b, c, d, a, x[i+13], 21, 1309151649);
      a = ii(a, b, c, d, x[i+4], 6, -145523070); d = ii(d, a, b, c, x[i+11], 10, -1120210379); c = ii(c, d, a, b, x[i+2], 15, 718787259); b = ii(b, c, d, a, x[i+9], 21, -343485551);
      a = add(a, olda); b = add(b, oldb); c = add(c, oldc); d = add(d, oldd);
    }
    return rhex(a) + rhex(b) + rhex(c) + rhex(d);
  };
}();

// ============================== 工具函数 ==============================
function bytesToBase64(bytes) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", r = "";
  for (var i = 0; i < bytes.length; i += 3) {
    var b = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    r += chars[(b >> 18) & 63] + chars[(b >> 12) & 63] + chars[(b >> 6) & 63] + chars[b & 63];
  }
  if (bytes.length % 3 === 1) r = r.slice(0, -2) + "==";
  if (bytes.length % 3 === 2) r = r.slice(0, -1) + "=";
  return r;
}

function utf8Encode(str) {
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
    else if (c < 0xD800 || c >= 0xE000) { bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    else { i++; c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF)); bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 16) & 0x3F), 0x80 | ((c >> 12) & 0x3F), 0x80 | (c & 0x3F)); }
  }
  return bytes;
}

function utf8ToBase64(str) { return bytesToBase64(utf8Encode(str)); }

// 京东自定义 Base64（编码表不同）
function jdBase64(str) {
  var stdChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var jdChars  = "KLMNOPQRSTABCDEFGHIJUVWXYZabcdopqrstuvwxefghijklmnyz0123456789+/";
  var b64 = utf8ToBase64(str);
  return b64.split("").map(function (c) {
    var idx = stdChars.indexOf(c);
    return idx >= 0 ? jdChars[idx] : c;
  }).join("");
}

function randomHex(n) {
  var r = "";
  var chars = "abcdef0123456789";
  for (var i = 0; i < n; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function randomStr(n) {
  var r = "";
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < n; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ============================== 京东签名算法 ==============================
function signCore(inarg) {
  var key = "80306f4370b39fd5630ad0529f77adb6";
  var mask = [0x37, 0x92, 0x44, 0x68, 0xA5, 0x3D, 0xCC, 0x7F, 0xBB, 0xF, 0xD9, 0x88, 0xEE, 0x9A, 0xE9, 0x5A];
  var arr = [];
  for (var i = 0; i < inarg.length; i++) {
    var r0 = inarg.charCodeAt(i);
    var r2 = mask[i & 0xF];
    var r4 = key.charCodeAt(i & 7);
    r0 = r2 ^ r0;
    r0 = r0 ^ r4;
    r0 = r0 + r2;
    r2 = r2 ^ r0;
    var r1 = key.charCodeAt(i & 7);
    r2 = r2 ^ r1;
    arr[i] = r2 & 0xFF;
  }
  return arr;
}

function getEp() {
  var u = randomHex(16);
  var ts = String(Date.now());
  var bu = jdBase64(u);
  var area = jdBase64(randomInt(1, 10000) + "_" + randomInt(1, 10000) + "_" + randomInt(1, 10000) + "_" + randomInt(1, 10000));
  var models = ["Mi11Ultra", "Mi11", "Mi10"];
  var d_model = jdBase64(models[randomInt(0, 2)]);
  var ep = '{"hdid":"JM9F1ywUPwflvMIpYPok0tt5k9kW4ArJEU3lfLhxBqw=","ts":' + (parseInt(ts) - randomInt(100, 1000)) + ',"ridx":-1,"cipher":{"area":"' + area + '","d_model":"' + d_model + '","wifiBssid":"dW5hbw93bq==","osVersion":"CJS=","d_brand":"WQvrb21f","screen":"CtS1DIenCNqm","uuid":"' + bu + '","aid":"' + bu + '","openudid":"' + bu + '"},"ciphertype":5,"version":"1.2.0","appname":"com.jingdong.app.mall"}';
  return { ep: ep, suid: u, st: ts };
}

function getSign(functionId, bodyObj) {
  var body = JSON.stringify(bodyObj);
  var epData = getEp();
  var svArr = ["102", "111", "120"];
  var sv = svArr[randomInt(0, 2)];
  var allArg = "functionId=" + functionId + "&body=" + body + "&uuid=" + epData.suid + "&client=android&clientVersion=11.2.8&st=" + epData.st + "&sv=" + sv;
  var coreBytes = signCore(allArg);
  var coreB64 = bytesToBase64(coreBytes);
  var sign = md5(coreB64);
  return "body=" + encodeURIComponent(body) + "&clientVersion=11.2.8&client=android&sdkVersion=31&lang=zh_CN&harmonyOs=0&networkType=wifi&oaid=" + epData.suid + "&ef=1&ep=" + encodeURIComponent(epData.ep) + "&st=" + epData.st + "&sign=" + sign + "&sv=" + sv;
}

// ============================== BoxJs 操作 ==============================
function prefsRead(key) {
  try { if (typeof $prefs !== "undefined") return $prefs.valueForKey(key) || ""; } catch (_) {}
  try { if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || ""; } catch (_) {}
  return "";
}
function prefsWrite(key, val) {
  try { if (typeof $prefs !== "undefined") { $prefs.setValueForKey(val, key); return true; } } catch (_) {}
  try { if (typeof $persistentStore !== "undefined") { $persistentStore.write(val, key); return true; } } catch (_) {}
  return false;
}

function loadWsList() {
  var raw = prefsRead("CookiesJD");
  var arr;
  try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return arr.filter(function (it) { return it && it.wskey && it.wskey.indexOf("wskey=") > 0; });
}

function updateCookie(pin, newCk, wsLine) {
  var raw = prefsRead("CookiesJD");
  var arr;
  try { arr = JSON.parse(raw); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var hit = false, i = 0;
  var encPin = encodeURIComponent(pin);
  // 提取 wskey 值用于模糊匹配
  var wsKeyVal = (wsLine || "").match(/wskey=([^;]+)/);
  var wsVal = wsKeyVal ? wsKeyVal[1] : "";
  for (; i < arr.length; i++) {
    var c = (arr[i] && arr[i].cookie) || "";
    var ew = (arr[i] && arr[i].wskey) || "";
    // 匹配1: 按 pt_pin
    var byPin = c.indexOf("pt_pin=" + pin + ";") >= 0 || c.indexOf("pt_pin=" + encPin + ";") >= 0;
    // 匹配2: 按 wskey 值（既包含已有条目也有 wskey，也匹配刚存的无 pt_key 条目）
    var byWs = wsVal && ew.indexOf(wsVal) >= 0;
    if (byPin || byWs) {
      arr[i].cookie = newCk;
      if (!arr[i].wskey) arr[i].wskey = wsLine || "";
      hit = true;
      break;
    }
  }
  if (!hit) arr.push({ cookie: newCk, wskey: wsLine || "" });
  if (prefsWrite("CookiesJD", JSON.stringify(arr))) {
    console.log("[WS转换] CookiesJD 已更新: " + pin);
    return true;
  }
  return false;
}

function doNotify(title, body) {
  try { if (typeof $notify !== "undefined") { $notify(title, "", body); return; } } catch (_) {}
  try { if (typeof $notification !== "undefined") { $notification.post(title, "", body); return; } } catch (_) {}
}

// ============================== 网络请求 ==============================
function httpGet(url) {
  return new Promise(function (resolve) {
    try {
      if (typeof $httpClient !== "undefined" && $httpClient.get) {
        $httpClient.get(url, function (err, resp, data) {
          if (err) { resolve({ err: err }); return; }
          resolve({ body: data || "", status: resp ? resp.statusCode || 0 : 0 });
        });
      } else if (typeof $task !== "undefined") {
        $task.fetch({ url: url, method: "GET" }).then(
          function (r) { resolve({ body: r.body || "", status: r.statusCode || (r.status || 0) }); },
          function (e) { resolve({ err: String(e) }); }
        );
      } else { resolve({ err: "no http api" }); }
    } catch (e) { resolve({ err: String(e) }); }
  });
}

function httpPost(url, body, contentType, cookie) {
  return new Promise(function (resolve) {
    var opts = { url: url, method: "POST", headers: {} };
    if (cookie) opts.headers["Cookie"] = cookie;
    if (contentType) opts.headers["Content-Type"] = contentType;
    if (body) opts.body = body;
    try {
      if (typeof $httpClient !== "undefined" && $httpClient.post) {
        $httpClient.post(opts, function (err, resp, data) {
          if (err) { resolve({ err: err }); return; }
          resolve({ body: data || "", status: resp ? resp.statusCode || 0 : 0, headers: resp && resp.headers ? resp.headers : {} });
        });
      } else if (typeof $task !== "undefined") {
        $task.fetch(opts).then(
          function (r) { resolve({ body: r.body || "", status: r.statusCode || (r.status || 0), headers: r.headers || {} }); },
          function (e) { resolve({ err: String(e) }); }
        );
      } else { resolve({ err: "no http api" }); }
    } catch (e) { resolve({ err: String(e) }); }
  });
}

// ============================== 核心：wskey→pt_key 转换 ==============================
function genToken(wskey) {
  return new Promise(function (resolve) {
    var sign = getSign("genToken", { url: "https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html" });
    var url = "http://api.m.jd.com/client.action?functionId=genToken&" + sign;
    var body = "body=" + encodeURIComponent(JSON.stringify({ to: "https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html" }));
    console.log("[WS转换] genToken 请求中...");
    httpPost(url, body, "application/x-www-form-urlencoded;", wskey).then(function (r) {
      if (r.err) { console.log("[WS转换] genToken 网络错误: " + r.err); resolve(""); return; }
      try {
        var j = JSON.parse(r.body);
        if (j && j.tokenKey) { console.log("[WS转换] genToken 成功"); resolve(j.tokenKey); }
        else { console.log("[WS转换] genToken 返回无 tokenKey: " + r.body.slice(0, 100)); resolve(""); }
      } catch (e) { console.log("[WS转换] genToken 解析失败: " + r.body.slice(0, 100)); resolve(""); }
    });
  });
}

function appjmp(tokenKey) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; console.log("[WS转换] appjmp 超时(20s)"); resolve(""); } }, 20000);
    function finish(ck) { try { clearTimeout(timer); } catch (_) {} if (done) return; done = true; resolve(ck); }
    function extractCookie(hdrs, body) {
      var setC = "", ptKey = "", ptPin = "";
      if (hdrs) { setC = hdrs["Set-Cookie"] || hdrs["set-cookie"] || ""; }
      if (Array.isArray(setC)) setC = setC.join("; ");
      if (setC) { var sck = setC.match(/pt_key=([^;]+)/); var scp = setC.match(/pt_pin=([^;]+)/); if (sck) ptKey = sck[1]; if (scp) ptPin = scp[1]; }
      if (ptKey && ptPin) return "pt_key=" + ptKey + ";pt_pin=" + ptPin + ";";
      if (body) { var bsk = body.match(/pt_key=([^;&"']{10,200})/); var bsp = body.match(/pt_pin=([^;&"']{1,100})/); if (bsk && bsp) { ptKey = bsk[1]; ptPin = bsp[1]; if (ptKey && ptPin) return "pt_key=" + ptKey + ";pt_pin=" + ptPin + ";"; } }
      return "";
    }

    // URL1: appjmp（标准流程，圈X 会跟随 302 丢掉 Set-Cookie）
    // URL2: 直接请求 302 的目标页（绕过 appjmp 的 302，直接拿 pt_key）
    var url1 = "https://un.m.jd.com/cgi-bin/app/appjmp?tokenKey=" + encodeURIComponent(tokenKey) + "&to=" + encodeURIComponent("https://plogin.m.jd.com/cgi-bin/m/thirdapp_auth_page") + "&client_type=android&appid=879&appup_type=1";
    var url2 = "https://plogin.m.jd.com/cgi-bin/m/thirdapp_auth_page?tokenKey=" + encodeURIComponent(tokenKey) + "&client_type=android&appid=879&appup_type=1";

    // 先试 appjmp
    console.log("[WS转换] appjmp 请求中...");
    function tryUrl(url, label, cb) {
      try {
        if (typeof $task !== "undefined") {
          $task.fetch({ url: url, method: "GET" }).then(
            function (r) {
              if (done) return;
              console.log("[WS转换] " + label + ": status=" + r.statusCode + " body=" + (r.body ? r.body.length : 0) + "b");
              var ck = extractCookie(r ? r.headers : null, r ? r.body : null);
              if (ck) { finish(ck); return; }
              // 打印 body 前 300 字节帮助判断
              var bodyExcerpt = (r.body || "").replace(/[\s\r\n]+/g, " ").slice(0, 300);
              console.log("[WS转换] " + label + " body≈ " + bodyExcerpt);
              if (cb) cb();
              else finish("");
            },
            function (e) { if (!done) { console.log("[WS转换] " + label + " err: " + e); if (cb) cb(); else finish(""); } }
          );
          return true;
        }
      } catch (_) {}
      return false;
    }

    // 先试 appjmp，失败后试直接请求 auth_page
    tryUrl(url1, "appjmp", function () {
      tryUrl(url2, "auth_page", null);
    });
  });
}

// ============================== 主流程 ==============================
(async function () {
  console.log("[WS转换] ====== wskey→pt_key 转换开始 ======");
  var wsList = loadWsList();
  if (!wsList.length) {
    console.log("[WS转换] 未找到有 wskey 的条目");
    doNotify("WS转换", "未找到有 wskey 的账号");
    $done({});
    return;
  }
  console.log("[WS转换] 共 " + wsList.length + " 个账号需要转换");
  var success = [], fail = [], skip = [];
  for (var i = 0; i < wsList.length; i++) {
    var item = wsList[i];
    var ws = item.wskey || "";
    var pin = "";
    var pm = ws.match(/pin=([^;]+)/);
    if (pm) pin = decodeURIComponent(pm[1]);
    console.log("[WS转换] [" + (i + 1) + "/" + wsList.length + "] 处理: " + (pin || "?"));
    var tokenKey = await genToken(ws);
    if (!tokenKey) {
      // wskey 可能过期
      if (pin) skip.push(pin);
      else skip.push("账号" + (i + 1));
      continue;
    }
    var newCk = await appjmp(tokenKey);
    if (!newCk) {
      if (pin) fail.push(pin);
      else fail.push("账号" + (i + 1));
      continue;
    }
    // 更新 BoxJs
    updateCookie(pin, newCk, item.wskey || "");
    success.push(pin || ("账号" + (i + 1)));
    console.log("[WS转换] ✅ " + pin + " 转换成功");
  }
  var summary = "成功: " + success.length + ", 失败: " + fail.length + ", 过期: " + skip.length;
  var detail = "";
  if (success.length) detail += "✅ " + success.join(", ");
  if (fail.length) detail += "\n❌ 失败: " + fail.join(", ");
  if (skip.length) detail += "\n⏭ 过期: " + skip.join(", ");
  console.log("[WS转换] ====== 完成: " + summary + " ======");
  doNotify("WS转换 " + summary, detail);
  $done({});
})();
