/*
 * ================================================
 *  极氪 (ZeekrLife) 自动签到 - Quantumult X
 * ================================================
 * 功能：
 *   1. 每日自动签到（/signin/create）
 *   2. 查询签到状态（/user/info/home）
 *   3. 领取签到/任务奖励（/taskProgress/taskMsg + take）
 *   4. 收集未领取能量球/碎片（/carEnergy/*）
 *   5. 完整结果推送到通知
 *
 * 使用方法：
 *   [task_local]
 *   30 9 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/zeekr_checkin.qx.js, tag=极氪签到, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jx_sign.png, enabled=true
 *
 *   [rewrite_local]
 *   ^https?:\/\/api-gw-toc\.zeekrlife\.com\/ url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/zeekr_checkin.qx.js
 *   (抓取 Token 用，任何 api-gw-toc.zeekrlife.com 请求都会触发，抓到后可注释)
 *
 * Token 获取方法：
 *   1. 打开圈x，MITM 开启 api-gw-toc.zeekrlife.com
 *   2. 打开极氪 App 随便逛逛（任意接口请求即可触发抓取，不限于签到页）
 *   3. 等待通知提示「Token 已保存」
 *
 * 签名算法（从 H5 前端 JS 逆向 + HAR 对拍验证）：
 *   secret = 内嵌密文 AES-GCM 解密 + 位运算还原（见 SIGN_SECRET，已验证与真实请求一致）
 *   x_ca_sign = SHA1( [secret, x_ca_nonce, x_ca_timestamp].sort().join('') )
 *
 * ================================================
 */

// ================= 配置区 =================
// Token（打开 App 后自动写入 BoxJs，也可在 BoxJs 中手动粘贴）
// 需要的关键字段：Authorization 里的 Bearer JWT（含 accountId，长期有效）
const TOKEN_KEY = 'zeekr_token';    // 单键 Token（旧版兼容 + 最近一个账号）
const TOKENS_KEY = 'zeekr_tokens';  // 多账号 JSON 数组 [{"token":"...","name":"..."}]

// ==============================================
const $ = new Env('极氪签到');

// ---------- 多账号 Token 管理 ----------
// 取账号标识：JWT 里的 jti（= accountId，稳定且唯一）
function getTokenId(token) {
  const jwt = String(token || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return '';
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return json.jti || '';
  } catch (e) {
    return '';
  }
}
// 解析 JWT 的 sub 字段（可能是对象，也可能是 JSON 字符串）
function getJwtSub(token) {
  const jwt = String(token || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = jwt.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
    let sub = json.sub;
    if (typeof sub === 'string') sub = JSON.parse(sub);
    return sub || {};
  } catch (e) {
    return {};
  }
}
// 取显示名：JWT 里的 nickname，否则用 jti
function getTokenName(token) {
  try {
    const sub = getJwtSub(token);
    const info = sub.accountInfoDTO || sub.accountInfoDTo || {};
    if (info.nickname) return info.nickname;
    const id = getTokenId(token);
    return id ? ('账号' + id) : '';
  } catch (e) {
    return '';
  }
}
// 读取全部账号（多键优先，空则迁移旧版单键）
function readTokenList() {
  let list = [];
  try {
    const raw = $.getdata(TOKENS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.filter(x => x && x.token);
    }
  } catch (e) {}
  if (!list.length) {
    const legacy = $.getdata(TOKEN_KEY);
    if (legacy) {
      list = [{ token: legacy, name: getTokenName(legacy), ts: 0 }];
      saveTokenList(list);
    }
  }
  return list;
}
// 写回全部账号；单键保持为最近一个（向后兼容）
function saveTokenList(list) {
  $.setdata(JSON.stringify(list), TOKENS_KEY);
  if (list.length) $.setdata(list[list.length - 1].token, TOKEN_KEY);
}
// 抓包写入时合并：按 jti 去重后追加
function mergeToken(token) {
  const id = getTokenId(token);
  const list = readTokenList().filter(a => {
    if (id) return getTokenId(a.token) !== id;
    return a.token !== token;
  });
  list.push({ token, name: getTokenName(token), ts: Date.now() });
  saveTokenList(list);
  return list;
}

// ============ 签名相关（逆向自 H5 前端 JS，已验证） ============
// 密钥：bundle 内嵌密文 AES-GCM 解密 + cyclicRightShift(3) XOR sha256 还原
// 真实请求验证: SHA1([secret, nonce, ts].sort().join('')) 与 x_ca_sign 一致
const SIGN_SECRET = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCz09z6e9WOcNq+nUMX8Vq1Xe2EmJxuR3XbturefioF)E(Fl';
const APPID = 'ONEX97FB91F061405';      // H5 页面 AppId（所有环境一致）
const APP_CODE = 'toc_h5_green_zeekrapp'; // H5 app_code，网关按此选签名密钥
const X_CA_KEY = 'H5-SIGN-SECRET-KEY';   // 与 SIGN_SECRET 对应
const UA_H5 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) zeekr_iOS_v5.0.2';

// 随机 nonce（H5 前端用 localStorage deviceId，我们用随机串，服务端只校验签名）
function getNonce(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ---------- SHA1 实现（纯 JS，无依赖） ----------
function sha1(input) {
  // 输入 UTF-8 编码为字节
  const str = String(input).replace(/\r\n/g, '\n');
  let utf8 = '';
  for (let n = 0; n < str.length; n++) {
    const c = str.charCodeAt(n);
    if (c < 128) {
      utf8 += String.fromCharCode(c);
    } else if (c > 127 && c < 2048) {
      utf8 += String.fromCharCode((c >> 6) | 192, (c & 63) | 128);
    } else {
      utf8 += String.fromCharCode((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
    }
  }
  const msg = utf8;
  const len = msg.length;

  // 填充
  const ml = len * 8;
  let block = '';
  for (let i = 0; i < len; i++) block += msg.charCodeAt(i).toString(2).padStart(8, '0');
  block += '1';
  while (block.length % 512 !== 448) block += '0';
  let lenBits = ml.toString(2);
  block += lenBits.padStart(64, '0');

  // 转 word 数组
  const words = [];
  for (let i = 0; i < block.length; i += 32) {
    words.push(parseInt(block.substr(i, 32), 2));
  }

  const rol = (num, cnt) => ((num << cnt) | (num >>> (32 - cnt))) >>> 0;
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    for (let j = 16; j < 80; j++) {
      w.push(rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1));
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const tmp = ((rol(a, 5) + f + e + k + w[j]) >>> 0) & 0xffffffff;
      e = d; d = c; c = rol(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) & 0xffffffff;
    h1 = (h1 + b) & 0xffffffff;
    h2 = (h2 + c) & 0xffffffff;
    h3 = (h3 + d) & 0xffffffff;
    h4 = (h4 + e) & 0xffffffff;
  }

  const hex = n => {
    let s = (n >>> 0).toString(16);
    while (s.length < 8) s = '0' + s;
    return s;
  };
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

// 生成签名头
function signHeaders() {
  const ts = String(Date.now());
  const nonce = getNonce();
  const parts = [SIGN_SECRET, nonce, ts].sort();
  const sign = sha1(parts.join(''));
  return { x_ca_sign: sign, x_ca_nonce: nonce, x_ca_timestamp: ts };
}

// 构造请求公共头（token 为完整 Bearer JWT）
function baseHeaders(token) {
  const s = signHeaders();
  return {
    'Authorization': token,
    'AppId': APPID,
    'app_code': APP_CODE,
    'app_type': 'h5',
    'device_id': '63105749387730861960',
    'platform_h5': 'IOS',
    'risk_platform': 'h5',
    'riskTimeStamp': s.x_ca_timestamp,
    'Version': '2',
    'WorkspaceId': 'prod',
    'x_ca_key': X_CA_KEY,
    'x_ca_nonce': s.x_ca_nonce,
    'x_ca_timestamp': s.x_ca_timestamp,
    'x_ca_sign': s.x_ca_sign,
    'Origin': 'https://activity-h5.zeekrlife.com',
    'Referer': 'https://activity-h5.zeekrlife.com/',
    'User-Agent': UA_H5,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
  };
}

// ---------- 网络请求 ----------
// verbose=false（默认）：成功只打一行摘要，失败才打完整响应
function request(method, url, body, token, verbose = false) {
  return new Promise((resolve, reject) => {
    const apiName = url.split('/').pop();
    const t0 = Date.now();
    if (verbose) $.log(`[请求] ${method} ${url}\n[Body] ${JSON.stringify(body || {})}`);

    const handleBody = (respBody) => {
      const cost = Date.now() - t0;
      let json;
      try {
        json = JSON.parse(respBody);
      } catch (e) {
        $.log(`[响应 ${apiName}] 解析失败: ${String(respBody).slice(0, 200)}`);
        resolve({ success: false, _raw: respBody });
        return;
      }
      // 兼容两种响应格式：H5 接口用 success+code，原生接口用 code+msg
      const ok = (json.success !== false && json.code === '000000');
      // 统一补 success 字段，调用处统一用 res.success 判断
      json.success = ok;
      if (verbose || !ok) {
        $.log(`[响应 ${apiName}] ${JSON.stringify(json).slice(0, 300)}`);
      } else {
        $.log(`[${apiName}] OK (${cost}ms)`);
      }
      resolve(json);
    };

    const opts = {
      url,
      method,
      headers: baseHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body)
    };

    if (typeof $task !== 'undefined') {
      // Quantumult X
      $task.fetch(opts).then(resp => handleBody(resp.body)).catch(err => reject(err));
    } else if (typeof $httpClient !== 'undefined') {
      // Surge / Loon
      const fn = method === 'GET' ? 'get' : 'post';
      $httpClient[fn](opts, (err, resp, data) => {
        if (err) { reject(err); return; }
        handleBody(data);
      });
    } else {
      // Node.js 测试环境
      const https = require('https');
      const http = require('http');
      const mod = url.startsWith('https') ? https : http;
      const u = new URL(url);
      const req = mod.request({
        hostname: u.hostname,
        path: u.pathname,
        method,
        headers: { ...baseHeaders(token), 'Content-Length': opts.body ? Buffer.byteLength(opts.body) : 0 }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => handleBody(data));
      });
      req.on('error', err => reject(err));
      if (opts.body) req.write(opts.body);
      req.end();
    }
  });
}

// ---------- 核心功能 ----------
// 各函数接受 token 参数，由 main() 按账号传入
async function doSignin(token) {
  // 签到动作（GET，方法已确认；H5 端即直接调用无参数）
  return request('GET', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-sic/v1/signin/create', undefined, token, true);
}

async function getHomeStatus(token) {
  // 签到状态（GET）
  return request('GET', 'https://api-gw-toc.zeekrlife.com/zeekrlife-app-user/v1/user/info/home', undefined, token);
}

async function getTasks(token) {
  // 任务列表（POST）
  return request('POST', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-mkt/open/v1/taskProgress/taskMsg',
    { activityRecord: 'medal_compose_task_manage', optional: { fetchTaskTakeAndReachTimesInfo: true } }, token);
}

async function takeTask(token, taskTemplateId, activityId) {
  // 领取任务奖励（POST，参数与 taskMsg 响应对应）
  return request('POST', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-mkt/v1/taskProgress/take',
    { activityRecord: 'medal_compose_task_manage', taskTemplateId, activityId }, token, true);
}

async function getUncollected(token, accountId) {
  // 待收集能量球/碎片（POST）
  return request('POST', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-val/v1/carEnergy/getUncollectedBallsPageNew',
    { accountId }, token);
}

async function collectAll(token, accountId, uncollectedList) {
  // 一键收集能量球/碎片（POST，HAR 未抓到该动作，参数按 getUncollected 响应对应；
  // 先用 {accountId} 试，若服务端拒绝（系统异常）再补 ids 重试）
  const ids = Array.isArray(uncollectedList)
    ? uncollectedList.map(x => (x && x.id) || null).filter(Boolean)
    : [];
  const first = await request('POST', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-val/v1/carEnergy/collectedAllEnergy',
    { accountId }, token, true);
  if (first.success || !ids.length) return first;
  const retry = await request('POST', 'https://api-gw-toc.zeekrlife.com/zeekrlife-mp-val/v1/carEnergy/collectedAllEnergy',
    { accountId, ids }, token, true);
  return retry;
}

// 单账号全流程
async function runAccount(acc) {
  const token = acc.token;
  const name = acc.name || getTokenName(token);
  const lines = [];
  lines.push(`👤 ${name}`);

  // 1. 查签到状态
  const home = await getHomeStatus(token);
  let already = false;
  if (home.success && home.data) {
    if (home.data.signStatus) {
      already = true;
      lines.push(`✅ 今日已签到（连续 ${home.data.signInNumber || 0} 天）`);
    } else {
      lines.push(`📝 今日未签到，执行签到`);
    }
  } else {
    lines.push(`⚠️ 签到状态查询失败: ${home.msg || JSON.stringify(home).slice(0, 80)}`);
  }

  // 2. 签到（今日未签才执行）
  if (!already) {
    const r = await doSignin(token);
    if (r.success) lines.push('✅ 签到成功');
    else lines.push(`⚠️ 签到返回: ${r.msg || JSON.stringify(r).slice(0, 80)}`);
    // 签到后再查一次状态确认
    const home2 = await getHomeStatus(token);
    if (home2.success && home2.data) {
      lines.push(`📅 连续签到 ${home2.data.signInNumber || 0} 天`);
    }
  }

  // 3. 任务奖励
  const tasks = await getTasks(token);
  if (tasks.success && tasks.data && tasks.data.taskReachMsgList) {
    const list = tasks.data.taskReachMsgList || [];
    // 可领取 = 已完成（currentComplete >= maxCompleteLimit）且尚未领取（take===false）
    const canTake = list.filter(t => t.taskTakeDTO && t.taskTakeDTO.take === false && t.taskTakeDTO.currentComplete >= t.taskTakeDTO.maxCompleteLimit);
    if (!canTake.length) {
      lines.push(`🎁 任务奖励: 今日无可领取（${list.length} 个任务）`);
    } else {
      for (const t of canTake) {
        lines.push(`🎁 待领取「${t.name}」（taskTemplateId=${t.taskTemplateId}）`);
        const tr = await takeTask(token, t.taskTemplateId, tasks.data.activityId);
        if (tr.success) lines.push(`  ✅ 已领取`);
        else lines.push(`  ⚠️ 领取失败: ${tr.msg || JSON.stringify(tr).slice(0, 80)}`);
        await $.wait(1500);
      }
    }
  } else {
    lines.push('⚠️ 任务列表获取失败');
  }

  // 4. 能量球收集
  const id = getTokenId(token);
  if (id) {
    const uc = await getUncollected(token, id);
    if (uc.success && uc.data && uc.data.uncollectedVal && uc.data.uncollectedVal.length) {
      const n = uc.data.uncollectedVal.length;
      lines.push(`⚡ 待收集能量: ${n} 项，尝试一键收集`);
      const ca = await collectAll(token, id, uc.data.uncollectedVal);
      if (ca.success) lines.push(`⚡ 收集成功: ${JSON.stringify(ca.data || {}).slice(0, 100)}`);
      else lines.push(`⚠️ 收集失败: ${ca.msg || JSON.stringify(ca).slice(0, 80)}`);
    } else {
      lines.push('⚡ 能量球: 已全部收集');
    }
  }

  return lines.join('\n');
}

async function main() {
  const list = readTokenList();
  if (!list.length) {
    $.msg($.name, '❌ 未抓到 Token', '打开极氪 App 任意页面触发抓取（需 MITM api-gw-toc.zeekrlife.com）');
    return;
  }
  const lines = [];
  for (let i = 0; i < list.length; i++) {
    lines.push(await runAccount(list[i]));
    if (i < list.length - 1) await $.wait(2000);
  }
  const multi = list.length > 1;
  $.msg($.name, multi ? `✅ 完成 (${list.length} 个账号)` : '✅ 完成', lines.join('\n\n'));
}

// ================================================
// 入口：抓取 Token / 定时任务
// ================================================
// 抓取分支：直接调用全局 API（$prefs/$notification/$done），不经过 Env 类，
// 避免 Env 的环境检测差异导致 setdata/通知静默失效（不报错、无提示）
if (typeof $request !== 'undefined' && $request.url && $request.url.indexOf('api-gw-toc.zeekrlife.com') !== -1) {
  // 这是 Token 抓取模式
  const headers = $request.headers || {};
  const token = headers.Authorization || headers.authorization || '';
  if (!token || token.indexOf('Bearer') === -1) {
    console.log('[ZEEKR] 未抓到有效 Token（缺 Authorization: Bearer），跳过');
  } else {
    try {
      const list = mergeToken(token);
      console.log('[ZEEKR] Token 已保存: ' + (getTokenName(token) || getTokenId(token)) + '（共 ' + list.length + ' 个账号）');
      if (typeof $notify !== 'undefined') {
        $notify('极氪签到', '✅ Token 已保存', (getTokenName(token) || getTokenId(token)) + ' 已写入，共 ' + list.length + ' 个账号，可注释抓取规则');
      } else if (typeof $notification !== 'undefined' && $notification.post) {
        $notification.post('极氪签到', '✅ Token 已保存', (getTokenName(token) || getTokenId(token)) + ' 已写入，共 ' + list.length + ' 个账号，可注释抓取规则');
      }
    } catch (e) {
      console.log('[ZEEKR] Token 处理异常: ' + e);
    }
  }
  if (typeof $done !== 'undefined') $done({});
} else {
  // 定时任务模式
  main();
}

// ================================================
// Env 工具类（圈x 通用）
// ================================================
function Env(name) {
  const isSurge = typeof $httpClient !== 'undefined';
  const isQuanX = typeof $task !== 'undefined';
  const isNode = typeof require !== 'undefined' && !isSurge && !isQuanX;

  return new (class {
    constructor() {
      this.name = name;
      this.startTime = new Date().getTime();
      this.dataFile = 'box.dat';
      this.encoding = 'utf-8';
      this.logs = [];
      this.isMute = false;
    }
    isNode() { return isNode; }
    getdata(key) {
      if (isSurge) return $persistentStore.read(key);
      if (isQuanX) return $prefs.valueForKey(key);
      if (isNode) return this.readdata(key);
    }
    setdata(val, key) {
      if (isSurge) return $persistentStore.write(val, key);
      if (isQuanX) return $prefs.setValueForKey(val, key);
      if (isNode) return this.writedata(val, key);
    }
    readdata(key) {
      const datas = this.readalldata();
      return datas && datas[key];
    }
    writedata(val, key) {
      const datas = this.readalldata();
      datas[key] = val;
      this.writealldata(datas);
    }
    readalldata() {
      try {
        return JSON.parse(require('fs').readFileSync(this.dataFile, this.encoding));
      } catch (e) {
        return {};
      }
    }
    writealldata(datas) {
      try {
        require('fs').writeFileSync(this.dataFile, JSON.stringify(datas), this.encoding);
        return true;
      } catch (e) {
        return false;
      }
    }
    log(...t) {
      const msg = t.map(x => x && typeof x === 'object' ? JSON.stringify(x) : String(x)).join('');
      console.log(msg);
      this.logs.push(msg);
    }
    msg(title = this.name, subtitle = '', body = '') {
      if (typeof $notify !== 'undefined') $notify(title, subtitle, body);
      else if (typeof $notification !== 'undefined' && $notification.post) $notification.post(title, subtitle, body);
      else if (isNode) this.log(`${title} ${subtitle} ${body}`);
    }
    wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    done(value = {}) {
      const endTime = (new Date().getTime() - this.startTime) / 1000;
      this.log(`🔔 ${this.name} 执行完毕, 用时 ${endTime} 秒`);
      if (isQuanX || isSurge) $done(value);
      else if (isNode) process.exit(0);
    }
  })();
}
