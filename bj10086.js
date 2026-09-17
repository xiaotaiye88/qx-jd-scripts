/**
 * 北京移动(10086) 签到 + 网龄成长计划 —— Quantumult X 脚本
 *
 * 用法见同目录 README.md / bj10086.conf
 *
 * 双模式(自动识别, 无需手动切换):
 *   1) rewrite 钩子: 你在 App 里打开签到页/网龄页时, 自动捕获并保存凭证
 *   2) cron 定时任务: 每日签到; 打开过网龄页后自动查询领取状态并(实验性)全自动领取
 *
 * 凭证来源(均为一次性/短时效, 所以必须靠钩子自动续期):
 *   - 签到:   uniTokenValidateH5 用 App 一次性票据换取的活动 token
 *   - 网龄:   loginCheck 换取的 User-Token (有效期 30 分钟)
 *
 * 网龄"自动领取"为实验功能: 跳过被 WASM 加密的 templatePrize/new,
 * 直接走可复刻的 templatePrize 接口(AES-ECB + RSA, 算法逆向自页面 chunk):
 *   发验证码 -> ntfy 取码 -> 加密提交。若服务端要求先走 /new 则会失败并降级为提醒。
 *
 * 需要 iOS 14+ (脚本使用了 BigInt)。
 */

// ========================= 可配置 =========================
const CONF = {
  // ntfy 短信主题地址(用于自动领取网龄流量包时读取验证码短信)
  // ⚠️ 不要把真实主题写死在脚本里(泄露=别人可读你的验证码), 请在 BoxJS 的「北京移动签到」里填写,
  //    键名 bj10086_ntfy, 形如 https://ntfy.sh/你的主题 ; 留空则不自动领取, 仅检测+提醒
  ntfyUrl: '',

  // 签到 doPrize 需要的设备指纹 constid: 钩子会自动从请求 URL 捕获并存储;
  // 未捕获前自动生成一个随机值兜底(首次打开签到页后即被真实值覆盖)
  constidFallback: '',

  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.5.4/CMCCIT',

  wl: {
    enabled: true,                    // 网龄自动领取(实验)总开关; false 则仅检测+提醒
    productCode: '130000006837',      // 网龄成长计划1GB流量月包券 SKU(2026-09 抓包值)
    activityId: '16096',              // 领取活动ID(可能随月份/期数变化, 领取失败优先核对它)
    touchCode: 'P00000001090',        // 渠道码, 来自网龄页 URL channelId
    pageId: '1879720710683729920',
    provinceCode: '100',              // 100=北京
    // 查询历史订单用的活动ID列表(旧期活动ID也放着用于判定"本月是否已领")
    orderActivityIds: ['16096', '1920407540822495232'],
    ntfyWaitMs: 90 * 1000,            // 等短信验证码的最长时间
  },
};

// COC H5 加密通道(逆向自 ageFeedbackV2 页面, 模块版本 "2" 使用 2048 位密钥):
//   请求体  {"cocEnContent": Base64(AES-128-ECB-PKCS7(JSON(payload), 随机key))}
//   请求头  coc-aurora: Base64(RSA-PKCS1v15(随机key字符串))  /  coc-aurora-v: 2
const COC_PUB_N_HEX =
  'D1AEBA78D05DFE2A1A1A710CD8057E72D417F1562DE9DB33CC8F333AFDBA29CD4' +
  '0EDEC7F72EFEDC666C1E96AD4E404684DE4B4824DCA4B6D5EFF13F5051D4552A2' +
  'FFF98278BFC829158DB5FF6816B843D50681C4777E053290D1BA2424A66AEFBAE' +
  '445F90250220E40484069C33E27D7996D97B15DE04F8D2E9FC9449C73351E7965' +
  'E54B2C56AE71661EF0522F5F904AC7C8BEB09599603A314DB8EB053CB60990D93' +
  '9B4FE3F184E057B0292896C1BC531FAD200A14F94015490D2A4FADB3FEC1CF54F' +
  '9E01C0AA62CFFEC17720CE8CAEE6FB06A87025EDEBBDD76AAF0F90D8983CBA967' +
  'FA14959BD7B50642C495ED83478955D2939A713A843FBF33DF6E904A1';
const COC_PUB_E = 65537;
const COC_EN_VERSION = '1486234121417629696';
const COC_AURORA_V = '2';

// ========================= 存储 =========================
const K = {
  token: 'bj10086_token',           // 签到活动 token (UUID)
  constid: 'bj10086_constid',
  lastSign: 'bj10086_lastSign',     // 最近一次签到成功日期
  pending: 'bj10086_pending',       // 钩子要求尽快跑一次签到
  lastDaily: 'bj10086_lastDaily',   // 最近一次执行每日任务的日期
  lastRun: 'bj10086_lastRun',       // 防止多任务行同时触发
  wlToken: 'bj10086_wlToken',       // 网龄 User-Token
  wlTokenTime: 'bj10086_wlTokenTime',
  wlPending: 'bj10086_wlPending',   // 钩子要求尽快跑一次网龄流程
  wlUser: 'bj10086_wlUser',         // userId (来自 loginCheck 响应)
  wlMobile: 'bj10086_wlMobile',     // 脱敏手机号, 形如 138****0000
};

function pget(key) { try { return $prefs.getValueForKey(key); } catch (e) { return null; } }
function pset(key, val) { try { $prefs.setValueForKey(String(val), key); } catch (e) {} }
function pdel(key) { pset(key, ''); }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// BoxJS / $prefs 参数: ntfy 主题(键 bj10086_ntfy), 其次脚本内置默认(发布版留空)
CONF.ntfyUrl = (pget('bj10086_ntfy') || '').trim() || CONF.ntfyUrl;
// constid 兜底: 无捕获值时生成随机指纹存本地, 之后固定使用
if (!CONF.constidFallback) {
  let stored = pget('bj10086_constid_fallback');
  if (!stored) {
    stored = randHex16() + randHex16() + randHex16();
    pset('bj10086_constid_fallback', stored);
  }
  CONF.constidFallback = stored;
}

// ========================= Base64 / 随机 =========================
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64C[b0 >> 2];
    out += B64C[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : B64C[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : B64C[b2 & 63];
  }
  return out;
}
function randBytes(n) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}
function randHex16() {
  // 对应页面 CryptoJS.lib.WordArray.random(8).toString() —— 8 字节的十六进制
  return randBytes(8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========================= AES-128-ECB / PKCS7 =========================
function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
const AES_SBOX = (() => {
  const s = new Array(256);
  for (let i = 0; i < 256; i++) {
    let inv = 0;
    for (let j = 0; j < 256; j++) { if (gfMul(i, j) === 1) { inv = j; break; } }
    let x = inv, r = inv;
    for (let b = 0; b < 4; b++) { x = ((x << 1) | (x >>> 7)) & 0xff; r ^= x; }
    s[i] = (r ^ 0x63) & 0xff;
  }
  return s;
})();
const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function aesExpandKey(keyBytes16) {
  const w = keyBytes16.slice(); // 176 字节轮密钥
  let rcon = 0;
  for (let i = 16; i < 176; i += 4) {
    let t = [w[i - 4], w[i - 3], w[i - 2], w[i - 1]];
    if (i % 16 === 0) {
      t = [AES_SBOX[t[1]] ^ AES_RCON[rcon++], AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
    }
    w[i] = w[i - 16] ^ t[0];
    w[i + 1] = w[i - 15] ^ t[1];
    w[i + 2] = w[i - 14] ^ t[2];
    w[i + 3] = w[i - 13] ^ t[3];
  }
  return w;
}

function aesEncryptBlock(w, block) {
  const xtime = x => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
  const s = block.slice();
  const addRK = r => { for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i]; };
  const subBytes = () => { for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]]; };
  // 行 r 循环左移 r; state[r][c] => flat[r + 4c]
  const shiftRows = () => {
    for (let r = 1; r < 4; r++) {
      const row = [s[r], s[r + 4], s[r + 8], s[r + 12]];
      for (let c = 0; c < 4; c++) s[r + 4 * c] = row[(c + r) % 4];
    }
  };
  // 列混淆; 一列 = flat 上连续 4 字节
  const mixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const i = 4 * c;
      const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      s[i]     = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
      s[i + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
      s[i + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
      s[i + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
    }
  };
  addRK(0);
  for (let r = 1; r <= 9; r++) { subBytes(); shiftRows(); mixColumns(); addRK(r); }
  subBytes(); shiftRows(); addRK(10);
  return s;
}

function aesEcbEncrypt(keyStr, plainBytes) {
  const w = aesExpandKey(keyStr.split('').map(c => c.charCodeAt(0) & 0xff));
  const padLen = 16 - (plainBytes.length % 16);
  const data = plainBytes.concat(new Array(padLen).fill(padLen));
  const out = [];
  for (let i = 0; i < data.length; i += 16) {
    out.push(...aesEncryptBlock(w, data.slice(i, i + 16)));
  }
  return out;
}

// ========================= RSA PKCS#1 v1.5 =========================
const RSA_N = BigInt('0x' + COC_PUB_N_HEX);
function modPow(base, exp, mod) {
  let r = 1n, b = base % mod;
  while (exp > 0n) {
    if (exp & 1n) r = r * b % mod;
    b = b * b % mod;
    exp >>= 1n;
  }
  return r;
}
function rsaEncryptPkcs1(msgBytes) {
  const k = 256; // 2048-bit
  if (msgBytes.length > k - 11) throw new Error('RSA: message too long');
  const em = [0x00, 0x02];
  while (em.length < k - msgBytes.length - 1) em.push(1 + Math.floor(Math.random() * 255));
  em.push(0x00);
  for (const b of msgBytes) em.push(b);
  const c = modPow(BigInt('0x' + em.map(b => b.toString(16).padStart(2, '0')).join('')), BigInt(COC_PUB_E), RSA_N);
  const hex = c.toString(16).padStart(k * 2, '0');
  const out = new Array(k);
  for (let i = 0; i < k; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// UTF-8 编码(页面 CryptoJS Utf8.parse 的等价实现)
function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++; // 代理对
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

// 用与页面一致的方式加密 payload, 返回 {cocEnContent, cocAurora}
function cocEncrypt(payloadObj) {
  const key = randHex16(); // 16 个 hex 字符, 直接作为 AES-128 的 UTF-8 密钥
  const cipher = b64encode(aesEcbEncrypt(key, utf8Bytes(JSON.stringify(payloadObj))));
  const aurora = b64encode(rsaEncryptPkcs1(utf8Bytes(key)));
  return { cocEnContent: cipher, cocAurora: aurora };
}

// ========================= HTTP =========================
function httpFetch(opts) {
  return new Promise((resolve, reject) => {
    $task.fetch(opts).then(resolve, reject);
  });
}
async function httpJson(opts) {
  const resp = await httpFetch(opts);
  try { return JSON.parse(resp.body); } catch (e) { return { __raw: (resp.body || '').slice(0, 200), statusCode: resp.statusCode }; }
}
const signHeaders = () => ({
  'User-Agent': CONF.ua,
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://h5.bj.10086.cn',
  'Referer': 'https://h5.bj.10086.cn/cmcc_app/checkin/index.html',
});
const cocHeaders = wlToken => ({
  'User-Agent': CONF.ua,
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://dev.coc.10086.cn',
  'Referer': 'https://dev.coc.10086.cn/coc/web6/ageFeedbackV2/?pageId=' + CONF.wl.pageId + '&channelId=' + CONF.wl.touchCode + '&iteration=true',
  'Cookie': 'User-Token=' + wlToken,
});

// ========================= 签到 =========================
async function checkinFlow(lines) {
  const token = pget(K.token);
  if (!token) {
    lines.push('❌ 签到: 尚未捕获凭证\n请打开 App → 签到赢好礼 页面(需开着圈X MITM)');
    return;
  }
  if (pget(K.lastSign) === todayStr()) {
    lines.push('✅ 签到: 今日已完成');
    return;
  }
  const constid = pget(K.constid) || CONF.constidFallback;
  const tid = Date.now();
  const url = 'https://h5.bj.10086.cn/ActSignIn2023/doPrize/JT/ActSignIn2023JT' +
    '?token=' + encodeURIComponent(token) + '&type=sign&constid=' + encodeURIComponent(constid) + '&transactionid=' + tid;
  const r = await httpJson({ url, method: 'POST', headers: signHeaders(), body: '' });
  if (r.result === 0) {
    pset(K.lastSign, todayStr());
    lines.push('🎉 签到: 成功 (' + (r.misdnmask || '本机') + ')');
  } else {
    const msg = String(r.errmsg || '') + String(r.message || '');
    if (/已签/.test(msg) || /已签/.test(JSON.stringify(r))) {
      pset(K.lastSign, todayStr());
      lines.push('✅ 签到: 今日已签过');
    } else {
      lines.push('⚠️ 签到: ' + (r.errmsg || r.message || '未知响应 ' + JSON.stringify(r).slice(0, 80)) +
        '\n(若提示 token 失效, 请打开 App 签到页刷新凭证)');
    }
  }
}

// ========================= 网龄成长计划 =========================
async function cocPost(wlToken, path, bodyObj, extraHeaders) {
  const opts = {
    url: 'https://dev.coc.10086.cn' + path,
    method: 'POST',
    headers: Object.assign(cocHeaders(wlToken), extraHeaders || {}),
    body: JSON.stringify(bodyObj || {}),
  };
  return httpJson(opts);
}

// 查询本月是否已领取 (依据订单列表里当月的网龄流量券)
async function wlClaimedThisMonth(wlToken) {
  try {
    const r = await cocPost(wlToken, '/coc/activities/prize/activityOrderListNew', { activityIds: CONF.wl.orderActivityIds });
    const arr = (((r.data || {}).contractRoot || {}).body || {}).data || {};
    const monthPrefix = todayStr().slice(0, 7); // YYYY-MM
    for (const k of Object.keys(arr)) {
      for (const o of arr[k] || []) {
        if (/网龄|流量/.test(o.skuName || '') && String(o.createTime || '').slice(0, 7) === monthPrefix) return true;
      }
    }
  } catch (e) {}
  return false;
}

// 从 ntfy 轮询读取验证码
async function wlWaitSmsCode(sinceSec) {
  const deadline = Date.now() + CONF.wl.ntfyWaitMs;
  for (;;) {
    try {
      const r = await httpFetch({ url: CONF.ntfyUrl + '/json?poll=1&since=' + sinceSec, method: 'GET', headers: {} });
      const candidates = [];
      for (const line of (r.body || '').split('\n')) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch (e) { continue; }
        if (m.event !== 'message' || !m.message || m.time < sinceSec) continue;
        if (!/验证码|code/i.test(m.message)) continue;
        let code = null;
        const mm = m.message.match(/验证码[^0-9]{0,8}([0-9]{4,6})/) || m.message.match(/([0-9]{6})/);
        if (mm) code = mm[1];
        if (!code) continue;
        const score = (/移动|10086|网龄|流量/.test(m.message) ? 2 : 0) + m.time;
        candidates.push({ score, code });
      }
      if (candidates.length) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].code;
      }
    } catch (e) {}
    if (Date.now() >= deadline) return null;
    await sleep(10 * 1000);
  }
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

// 实验性自动领取
async function wlTryClaim(wlToken, lines) {
  const tag = '🧪 网龄自动领取';
  if (!CONF.wl.enabled) return;
  if (!CONF.ntfyUrl) {
    lines.push(tag + ': 未配置 ntfy 短信主题(BoxJS 键 bj10086_ntfy), 跳过自动领取, 请手动领取');
    return;
  }
  const userId = pget(K.wlUser), mobile = pget(K.wlMobile);
  if (!userId || !mobile) {
    lines.push(tag + ': 缺少 userId/手机号(loginCheck 响应钩子未捕获), 请重新打开一次网龄页');
    return;
  }
  if (await wlClaimedThisMonth(wlToken)) {
    lines.push('✅ 网龄: 本月流量包已领取');
    return;
  }

  // 1. 触发短信验证码
  const sms = await cocPost(wlToken, '/coc/user/smsCode', {
    mobile, productCode: CONF.wl.productCode, pageId: CONF.wl.pageId,
    touchCode: CONF.wl.touchCode, smsCodeTypeEnum: '505', userId,
  });
  if (sms.code !== '0') {
    lines.push(tag + ': 发送验证码失败 → ' + (sms.message || JSON.stringify(sms).slice(0, 100)));
    return;
  }

  // 2. 等 ntfy 短信
  const code = await wlWaitSmsCode(Math.floor(Date.now() / 1000) - 2);
  if (!code) {
    lines.push(tag + ': ' + Math.round(CONF.wl.ntfyWaitMs / 1000) + 's 内未收到验证码短信');
    return;
  }

  // 3. 加密提交领取
  const payload = {
    activityId: CONF.wl.activityId,
    provinceCode: CONF.wl.provinceCode,
    jsonExtParam: JSON.stringify({ smsCode: code, productCode: CONF.wl.productCode, touchCode: CONF.wl.touchCode }),
  };
  const enc = cocEncrypt(payload);
  const r = await cocPost(wlToken, '/coc/activities/prize/templatePrize', { cocEnContent: enc.cocEnContent }, {
    'coc-aurora': enc.cocAurora,
    'coc-aurora-v': COC_AURORA_V,
    'coc-en-version': COC_EN_VERSION,
  });
  if (r.code === '0' || r.code === 0) {
    lines.push('🎉 网龄: 领取成功! 验证码 ' + code + (r.data && r.data.skuCode ? '\nSKU ' + r.data.skuCode : ''));
  } else {
    lines.push(tag + ' 失败: ' + (r.message || JSON.stringify(r).slice(0, 120)) +
      '\n若提示活动/订单类错误, 多半是该接口需先走加密的 /new, 请手动在 App 里领取');
  }
}

async function wlFlow(lines) {
  const wlToken = pget(K.wlToken);
  const t = Number(pget(K.wlTokenTime) || 0);
  const pending = pget(K.wlPending) === '1';
  const fresh = wlToken && (Date.now() - t) < 25 * 60 * 1000; // cookie 实际 30 分钟
  if (!wlToken || (!fresh && !pending)) return; // 无凭证且无待办, 静默
  if (!fresh) {
    lines.push('ℹ️ 网龄: User-Token 已过期(30分钟), 打开 App 网龄页可自动续期');
    pdel(K.wlPending);
    return;
  }
  try {
    await wlTryClaim(wlToken, lines);
    if (pget(K.wlPending) === '1' && !CONF.wl.enabled) {
      lines.push('ℹ️ 网龄: 已打开页面并登录(自动领取未开启), 请手动领取');
    }
  } catch (e) {
    lines.push('⚠️ 网龄: 流程异常 ' + (e && e.message ? e.message : e));
  }
  pdel(K.wlPending);
}

// ========================= 钩子模式 =========================
function getHeader(headers, name) {
  for (const k of Object.keys(headers || {})) {
    if (k.toLowerCase() === name.toLowerCase()) return headers[k];
  }
  return '';
}

function hookMain() {
  try {
    const url = ($request && $request.url) || '';

    // ---- 网龄: loginCheck 响应含 userId/手机号/User-Token ----
    if (typeof $response !== 'undefined' && $response && /dev\.coc\.10086\.cn\/coc\/user\/loginCheck/.test(url)) {
      try {
        const j = JSON.parse($response.body);
        const d = j.data || {};
        if (d.token) { pset(K.wlToken, d.token); pset(K.wlTokenTime, Date.now()); }
        if (d.userId) pset(K.wlUser, d.userId);
        if (d.maskedMobile) pset(K.wlMobile, d.maskedMobile);
        if (d.provinceCode) pset('bj10086_province', d.provinceCode);
        pset(K.wlPending, '1');
      } catch (e) {}
      $done({});
      return;
    }
    // ---- 签到: uniTokenValidateH5 响应含活动 token ----
    if (typeof $response !== 'undefined' && $response && /h5\.bj\.10086\.cn\/ActivityUnifyLogin\/uniTokenValidateH5/.test(url)) {
      try {
        const j = JSON.parse($response.body);
        if (j.token && /^[0-9a-f-]{36}$/i.test(j.token)) {
          pset(K.token, j.token);
          pset(K.pending, '1');
        }
      } catch (e) {}
      $done({});
      return;
    }

    // ---- 请求钩子 ----
    if (/h5\.bj\.10086\.cn\/(ActivityUnifyLogin|ActSignIn2023)/.test(url)) {
      const m = url.match(/[?&]token=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) { pset(K.token, m[1]); pset(K.pending, '1'); }
      const c = url.match(/[?&]constid=([^&]+)/);
      if (c) pset(K.constid, decodeURIComponent(c[1]));
    }
    if (/dev\.coc\.10086\.cn\/coc\/(user\/loginCheck|activities|web6\/ageFeedbackV2)/.test(url)) {
      const ck = getHeader(($request || {}).headers, 'cookie') || '';
      const m = ck.match(/User-Token=([A-Za-z0-9_\-]+)/);
      if (m) {
        pset(K.wlToken, m[1]);
        pset(K.wlTokenTime, Date.now());
        if (/loginCheck|ageFeedbackV2/.test(url)) pset(K.wlPending, '1');
      }
    }
  } catch (e) {}
  $done({});
}

// ========================= 定时任务模式 =========================
async function cronMain() {
  const now = Date.now();
  const pending = pget(K.pending) === '1' || pget(K.wlPending) === '1';

  // 同一时刻多个 task 行触发时只跑一次(有 pending 标记则不受限)
  if (!pending && now - Number(pget(K.lastRun) || 0) < 5 * 60 * 1000) { $done(); return; }
  const dailyDue = new Date().getHours() === 9 && pget(K.lastDaily) !== todayStr();
  if (!pending && !dailyDue) { pset(K.lastRun, now); $done(); return; }
  pset(K.lastRun, now);

  const lines = [];
  try { await checkinFlow(lines); } catch (e) { lines.push('⚠️ 签到: 异常 ' + (e && e.message ? e.message : e)); }
  try { await wlFlow(lines); } catch (e) { lines.push('⚠️ 网龄: 异常 ' + (e && e.message ? e.message : e)); }

  pdel(K.pending);
  if (new Date().getHours() === 9) pset(K.lastDaily, todayStr());

  if (lines.length) {
    $notify('中国移动 任务', todayStr(), lines.join('\n——\n'));
  }
  $done();
}

// ========================= 入口 =========================
if ((typeof $request !== 'undefined' && $request) || (typeof $response !== 'undefined' && $response)) {
  hookMain();
} else if (typeof $prefs !== 'undefined' && typeof $task !== 'undefined') {
  cronMain();
}

// 供本地 Node 测试使用
if (typeof module !== 'undefined') {
  module.exports = { b64encode, aesEcbEncrypt, cocEncrypt, randHex16, gfMul };
}
