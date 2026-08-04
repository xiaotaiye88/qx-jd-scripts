/*
 * ================================================
 *  什么值得买 (SMZDM) 自动签到 - Quantumult X
 * ================================================
 * 功能：
 *   1. 每日自动签到（/checkin）
 *   2. 查询签到奖励（/checkin/all_reward）
 *   3. 检查并领取连续签到额外奖励（/checkin/extra_reward）
 *   4. 查询会员信息（/vip）
 *   5. 完整结果推送到通知
 *
 * 使用方法：
 *   [task_local]
 *   30 9 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/smzdm_checkin.qx.js, tag=什么值得买签到, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jx_sign.png, enabled=true
 *
 *   [rewrite_local]
 *   ^https?:\/\/user-api\.smzdm\.com\/ url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/smzdm_checkin.qx.js
 *   (抓取 Cookie 用，任何 user-api.smzdm.com 请求都会触发，抓到后可注释)
 *
 * Cookie 获取方法：
 *   1. 打开圈x，MITM 开启 user-api.smzdm.com
 *   2. 打开什么值得买 App 随便逛逛（任意接口请求即可触发抓取，不限于签到页）
 *   3. 等待通知提示「Cookie 已保存」
 *
 * 数据来源：
 *   签名算法由抓包数据反推验证（key 见 SIGN_KEY 常量）
 *   checkin 请求实测可复现 sign
 *
 * ================================================
 */

// ================= 配置区 =================
// Cookie（打开 App 后自动写入 BoxJs，也可在 BoxJs 中手动粘贴）
// 需要的关键字段：sess=xxx; smzdm_id=xxx; device_s=xxx;
// 抓取规则见脚本头部说明，抓到后自动保存到 $prefs（BoxJs 键名 smzdm_cookie）
const COOKIE_KEY = 'smzdm_cookie';

// ==============================================
const $ = new Env('什么值得买签到');

// 版本信息（对应你的抓包 iPhone 11.1.8）
const APP_VERSION = '11.1.8';
const APP_REV = '164.8';

// 签名密钥（从抓包反推，已验证）
const SIGN_KEY = 'zok5JtAq3$QixaA%mncn*jGWlEpSL3E1';

// 请求公共参数（与抓包一致）
const COMMON_PARAMS = {
  basic_v: '0',
  f: 'iphone',
  v: APP_VERSION,
  weixin: '1',
  zhuanzai_ab: 'a'
};

// User-Agent（与抓包一致）
const USER_AGENT = `smzdm ${APP_VERSION} rv:${APP_REV} (iPhone 16 Pro Max; iOS 26.1; zh_CN)/iphone_smzdmapp/${APP_VERSION}`;

// ==============================================

// ---------- MD5 实现（纯 JS，无依赖） ----------
// 来源：https://github.com/blueimp/JavaScript-MD5 (MIT)
function md5(input) {
  const safeAdd = (x, y) => {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  };
  const bitRotateLeft = (num, cnt) => (num << cnt) | (num >>> (32 - cnt));
  const md5cmn = (q, a, b, x, s, t) => safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  const md5ff = (a, b, c, d, x, s, t) => md5cmn((b & c) | (~b & d), a, b, x, s, t);
  const md5gg = (a, b, c, d, x, s, t) => md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  const md5hh = (a, b, c, d, x, s, t) => md5cmn(b ^ c ^ d, a, b, x, s, t);
  const md5ii = (a, b, c, d, x, s, t) => md5cmn(c ^ (b | ~d), a, b, x, s, t);

  const binlMD5 = (x, len) => {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d;
      a = md5ff(a, b, c, d, x[i], 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, x[i], 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, x[i], 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = safeAdd(a, olda);
      b = safeAdd(b, oldb);
      c = safeAdd(c, oldc);
      d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  };

  const binl2hex = binarray => {
    const hexTab = '0123456789abcdef';
    let str = '';
    for (let i = 0; i < binarray.length * 4; i++) {
      str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) +
        hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xf);
    }
    return str;
  };

  const utf8Encode = str => {
    str = str.replace(/\r\n/g, '\n');
    let utftext = '';
    for (let n = 0; n < str.length; n++) {
      const c = str.charCodeAt(n);
      if (c < 128) {
        utftext += String.fromCharCode(c);
      } else if (c > 127 && c < 2048) {
        utftext += String.fromCharCode((c >> 6) | 192);
        utftext += String.fromCharCode((c & 63) | 128);
      } else {
        utftext += String.fromCharCode((c >> 12) | 224);
        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
        utftext += String.fromCharCode((c & 63) | 128);
      }
    }
    return utftext;
  };

  const str2binl = str => {
    const bin = [];
    const mask = (1 << 8) - 1;
    for (let i = 0; i < str.length * 8; i += 8) {
      bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << (i % 32);
    }
    return bin;
  };

  const str = utf8Encode(String(input));
  return binl2hex(binlMD5(str2binl(str), str.length * 8));
}

// ---------- 工具函数 ----------
function getRandomRequestKey() {
  // 模拟抓包里的 request_key（随机数字 + 时间戳）
  return `${Math.floor(Math.random() * 900000) + 100000}${Date.now()}`;
}

function getTimeMs() {
  return `${Math.round(Date.now() / 1000)}000`;
}

/**
 * 生成 sign 签名
 * 算法（从抓包反推验证）：
 *   1. 参数按 key 字母排序
 *   2. 跳过空值，拼接为 k=v&k=v...
 *   3. 末尾加 &key=zok5JtAq3$QixaA%mncn*jGWlEpSL3E1
 *   4. MD5 大写
 */
function getSign(params) {
  const keys = Object.keys(params).filter(k => params[k] !== '' && params[k] != null).sort();
  const str = keys.map(k => `${k}=${String(params[k]).replace(/\s+/g, '')}`).join('&');
  const signStr = `${str}&key=${SIGN_KEY}`;
  return md5(signStr).toUpperCase();
}

function buildParams(extra = {}) {
  const params = { ...COMMON_PARAMS, ...extra };
  params.time = getTimeMs();
  params.sign = getSign(params);
  return params;
}

function urlEncodeParams(params) {
  return Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
}

// ---------- 网络请求 ----------
function request(url, params, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = urlEncodeParams(params);
    const reqHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
      'Accept-Language': 'zh-Hans-CN;q=1, zh-Hant-CN;q=0.9',
      // 注意：不要加 Accept-Encoding: gzip，否则圈x $task 收到的是压缩数据无法解析
      'Connection': 'keep-alive',
      'request_key': getRandomRequestKey(),
      'Cookie': $.getdata(COOKIE_KEY) || '',
      ...headers
    };
    $.log(`[请求] POST ${url}`);
    $.log(`[参数] ${body}`);

    // 圈x ($task) / Surge-Loon ($httpClient) / Node 兼容
    if (typeof $task !== 'undefined') {
      // Quantumult X
      $task.fetch({
        url,
        method: 'POST',
        headers: reqHeaders,
        body
      }).then(resp => {
        $.log(`[响应] ${resp.body}`);
        try {
          resolve(JSON.parse(resp.body));
        } catch (e) {
          resolve({ error_code: '-1', error_msg: '响应解析失败', raw: resp.body });
        }
      }).catch(err => reject(err));
    } else if (typeof $httpClient !== 'undefined') {
      // Surge / Loon
      $httpClient.post({ url, headers: reqHeaders, body }, (err, resp, data) => {
        if (err) { reject(err); return; }
        $.log(`[响应] ${data}`);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error_code: '-1', error_msg: '响应解析失败', raw: data });
        }
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
        method: 'POST',
        headers: { ...reqHeaders, 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          $.log(`[响应] ${data}`);
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error_code: '-1', error_msg: '响应解析失败', raw: data });
          }
        });
      });
      req.on('error', err => reject(err));
      req.write(body);
      req.end();
    }
  });
}

// ---------- 核心功能 ----------
async function checkin() {
  $.log('========== 开始签到 ==========');
  const cookie = $.getdata(COOKIE_KEY);
  if (!cookie) {
    $.log('❌ 未找到 Cookie！请先打开什么值得买 App 触发抓取');
    return false;
  }
  $.log(`✅ Cookie 已加载: ${cookie.length} 字符`);
  // 提示 Cookie 抓取时间（sess 一般 30 天有效）
  try {
    const ts = parseInt($.getdata(COOKIE_KEY + '_ts')) || 0;
    if (ts > 0) {
      const days = Math.floor((Date.now() - ts) / 86400000);
      if (days > 20) $.log(`⚠️ Cookie 已使用 ${days} 天，接近 30 天有效期，建议重新抓取`);
      else $.log(`📅 Cookie 已使用 ${days} 天`);
    }
  } catch (e) {}

  // 1. 签到
  const params = buildParams({});
  const result = await request('https://user-api.smzdm.com/checkin', params);

  if (result.error_code === '0') {
    // 接口对「已签到」也返回 error_code=0，需靠 error_msg 区分
    if (result.error_msg === '已签到' || (result.error_msg && result.error_msg.indexOf('已签到') !== -1)) {
      $.log('ℹ️ 今天已经签过到了');
      return null;
    }
    const d = result.data;
    $.log(`✅ 签到成功！连续 ${d.daily_num} 天`);
    $.log(`🏅 金币: ${d.cgold} | 碎银: ${d.pre_re_silver} | 经验: ${d.cexperience} | 补签卡: ${d.cards}`);
    return d;
  } else {
    $.log(`❌ 签到失败: ${result.error_msg || JSON.stringify(result)}`);
    return false;
  }
}

async function allReward() {
  $.log('\n========== 查询签到奖励 ==========');
  const params = buildParams({});
  const result = await request('https://user-api.smzdm.com/checkin/all_reward', params);
  if (result.error_code === '0' && result.data && result.data.normal_reward) {
    const nr = result.data.normal_reward;
    const reward = nr.reward_add || {};
    const gift = nr.gift || {};
    $.log(`🎁 签到奖励: ${reward.title || ''} ${reward.content || ''}`);
    $.log(`🎁 连续奖励: ${gift.title || gift.sub_content || ''}`);
    return nr;
  }
  $.log('（暂无额外奖励或已领取）');
  return null;
}

async function extraReward() {
  $.log('\n========== 检查额外奖励 ==========');
  // 先查签到视图，看是否有连续签到奖励
  const viewParams = buildParams({});
  const view = await request('https://user-api.smzdm.com/checkin/show_view_v2', viewParams);
  let canExtra = false;
  if (view.error_code === '0' && view.data && view.data.rows) {
    const row = view.data.rows.find(r => r.cell_type === '18001');
    if (row && row.cell_data && row.cell_data.checkin_continue) {
      canExtra = row.cell_data.checkin_continue.continue_checkin_reward_show;
      $.log(`连续签到天数: ${row.cell_data.checkin_continue.continue_checkin_days}`);
    }
  }
  if (!canExtra) {
    $.log('ℹ️ 今天没有额外奖励可领');
    return null;
  }
  // 领取额外奖励
  const params = buildParams({});
  const result = await request('https://user-api.smzdm.com/checkin/extra_reward', params);
  $.log(`🎁 额外奖励: ${JSON.stringify(result.data || result)}`);
  return result.data;
}

async function getVipInfo() {
  $.log('\n========== 会员信息 ==========');
  const params = buildParams({});
  const result = await request('https://user-api.smzdm.com/vip', params);
  if (result.error_code === '0' && result.data && result.data.vip) {
    const v = result.data.vip;
    $.log(`👑 值会员等级: ${v.exp_level} | 经验: ${v.exp_current}/${v.exp_current_level}`);
    return v;
  }
  $.log('（非值会员或查询失败）');
  return null;
}

// ---------- 主流程 ----------
async function main() {
  let msg = '';
  try {
    const checkinResult = await checkin();
    if (checkinResult === false) {
      msg = '❌ 签到失败：Cookie 无效或接口异常';
      $.msg('什么值得买签到', '❌ 失败', msg);
      return;
    }
    if (checkinResult) {
      msg += `✅ 签到成功！连续 ${checkinResult.daily_num} 天\n`;
      msg += `🏅 金币: ${checkinResult.cgold} | 碎银: ${checkinResult.pre_re_silver} | 补签卡: ${checkinResult.cards}\n`;
    } else {
      msg += 'ℹ️ 今天已签到过\n';
    }

    await new Promise(r => setTimeout(r, 2000));
    const reward = await allReward();
    if (reward) {
      msg += `🎁 ${reward.reward_add && reward.reward_add.title}: ${reward.reward_add && reward.reward_add.content}\n`;
    }

    await new Promise(r => setTimeout(r, 2000));
    const extra = await extraReward();
    if (extra) {
      msg += `🎁 额外: ${JSON.stringify(extra)}\n`;
    }

    await new Promise(r => setTimeout(r, 2000));
    const vip = await getVipInfo();
    if (vip) {
      msg += `👑 值会员: ${vip.exp_level} (${vip.exp_current}/${vip.exp_current_level})`;
    }

    $.msg('什么值得买签到', '✅ 完成', msg);
    $.log(`\n========== 全部完成 ==========\n${msg}`);
  } catch (e) {
    $.log('❌ 异常:', e.message, e.stack);
    $.msg('什么值得买签到', '❌ 异常', e.message);
  } finally {
    $.done();
  }
}

// 圈x 环境下从 rewrite 抓取 Cookie 的处理
// 以 script-request-header 运行：任何 user-api.smzdm.com 请求都会经过这里（不限于 /checkin）
if (typeof $request !== 'undefined' && $request.url && $request.url.indexOf('user-api.smzdm.com') !== -1) {
  // 这是 Cookie 抓取模式
  const cookie = ($request.headers && ($request.headers.Cookie || $request.headers.cookie)) || '';
  if (!cookie || (cookie.indexOf('sess=') === -1 && cookie.indexOf('smzdm_id=') === -1)) {
    $.log('[SMZDM] 未抓到有效 Cookie（缺 sess/smzdm_id），跳过');
    $.done({});
  } else {
    $.setdata(cookie, COOKIE_KEY);
    $.setdata(String(Date.now()), COOKIE_KEY + '_ts');
    $.msg('什么值得买签到', '✅ Cookie 已保存', `已写入 ${cookie.length} 字符，可以注释掉抓取规则了`);
    $.log(`[SMZDM] Cookie 已保存: ${cookie.slice(0, 50)}...`);
    $.done({});
  }
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
    constructor(t) {
      this.name = t;
      this.startTime = new Date().getTime();
      this.data = null;
      this.dataFile = 'box.dat';
      this.logs = [];
      this.isMute = false;
      this.isNeedRewrite = false;
      this.logSeparator = '\n';
      this.encoding = 'utf-8';
      this.endTime = this.startTime;
    }
    getdata(key) {
      const val = (isSurge && $persistentStore.read(key)) || (isQuanX && $prefs.valueForKey(key)) || (isNode && this.readdata(key));
      return val;
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
      if (isQuanX) $notification.post(title, subtitle, body);
      else if (isSurge) $notification.post(title, subtitle, body);
      else if (isNode) this.log(`${title} ${subtitle} ${body}`);
    }
    done(value = {}) {
      const endTime = (new Date().getTime() - this.startTime) / 1000;
      this.log(`🔔 ${this.name} 执行完毕, 用时 ${endTime} 秒`);
      if (isQuanX || isSurge) $done(value);
      else if (isNode) process.exit(0);
    }
  })(name);
}
