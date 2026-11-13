/*
 * 国补×超补 频道任务（Quantumult X 原生版）
 * 活动页: pro.m.jd.com/mall/active/DvFPmKRas9GYjDPZjT9NT14BAv6 (百补频道-推荐页)
 *
 * 功能（2026-11 抓包逆向, HAR 实录验证）:
 *   1. billion_sign_info  每日签到（+1 京豆 + 家电国补券）
 *   2. common_task_list   拉取 19 个频道任务
 *   3. common_do_task     自动做「浏览类」任务:
 *      - 等待类(waitDuration>0): actionType 1(开始,带素材itemId+jumpUrl) → 等 wait+3 秒 → actionType 0(领奖)
 *      - 即时类(waitDuration=0): 直接 actionType 0(doReceiveRewards 1)
 *   任务每天重置(timesLimitType 1), 明天 cron 再跑会继续做。
 *
 * 实测记录(2026-11-13):
 *   - common_task_list / billion_sign_info 无 h5st 即可调通(Mac node 也 OK)
 *   - common_do_task 网关校验更严: Mac node 全部 405「活动火爆」(连 HAR 原样重放也 405,
 *     怀疑 TLS/JA3 指纹识别)。QX 走 iOS 原生网络栈与京东 App 一致, 待手机端验证。
 *   - 若 405: 脚本自动降级, 只做能做的(签到/领已达成的奖励), 并在通知中提示。
 *
 * cron: 25 9 * * *
 * BoxJs 键: CookiesJD / CookieJD / CookieJD2（多账号）
 *           JD_SUPER_COUPON = "false" 时跳过「优惠券类」任务只做京豆类（默认做）
 *
 * 频率控制: 全程串行——账号一个一个来、任务一个一个做、每轮做完停一停。
 *   轮间隔 5s / 任务间隔 6s / 账号间隔 15s（均带 ±20% 随机抖动, 避免机械节奏）。
 *   最坏情况总时长 ≈ 20 分钟（含券类）; JD_SUPER_COUPON=false 时约 8 分钟。
 */

const ACT_PAGE = 'https://pro.m.jd.com/mall/active/DvFPmKRas9GYjDPZjT9NT14BAv6/index.html';
const ACT_ID = '01425483';
const BABEL_CHANNEL = 'ttt12';
const APPID = 'SecKill2020';
const CHANNEL_ID = '7';
const GEO = {
  mainChannel: '1', gps_area: '1_72_55657_0',
  geoLng: '116.407506', geoLat: '40.008785', lng: '116.407171', lat: '40.008332',
};
// billion_sign_info 的项目/任务 ID（抓包实录, 活动到 2027-12-31）
const SIGN_PROJECT = '3iFuS7TyJpKixsa4tZj9EBMr1jxJ';
const SIGN_ASSIGN = 'bWLRWiLiFiyMtVuzcwn5zWCAfcz';
const UA = 'jdapp;iPhone;16.1.50;;;M/5.0;appBuild/171135;jdSupportDarkMode/1;lang/zh_CN;ctype/0;site/CN;ccy/CNY;elder/0;ef/1;';
const TIMEOUT = 20000;

// 频率控制（毫秒）: 全程串行执行, 三级间隔, 每次停顿带 ±20% 随机抖动
const GAP_ROUND = 5000;    // 同一任务 每轮之间
const GAP_TASK = 6000;     // 不同任务之间（含失败换任务）
const GAP_ACCOUNT = 15000; // 不同账号之间

// 任务黑名单: 名字含这些关键词的跳过（无法自动化/需要外部 App/真组件）
const SKIP_NAME = ['助力', '安装桌面小组件', '小程序导流', '特价APP'];
// 优惠券类任务（无豆只有券, 可用 BoxJs 开关关闭）
const COUPON_NAME = ['发券', '墨缘'];

// ---------- 读 Cookie（BoxJs / 本地存储，支持多账号）----------
function readCookies() {
  const keys = ['CookiesJD', 'CookieJD', 'CookieJD2'];
  for (const k of keys) {
    let raw = null;
    try {
      if (typeof $prefs !== 'undefined') raw = $prefs.valueForKey(k);
      if (!raw && typeof $persistentStore !== 'undefined') raw = $persistentStore.read(k);
    } catch (e) { /* 忽略 */ }
    if (!raw) continue;
    let arr = null;
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) arr = p;
    } catch (e) { /* 不是 JSON，按单条 cookie 处理 */ }
    const list = arr ? arr : [{ cookie: raw }];
    const out = list
      .map(it => (typeof it === 'string' ? it : it.cookie))
      .filter(c => c && c.indexOf('pt_key') >= 0);
    if (out.length) return out;
  }
  return [];
}

function pinOf(ck) {
  const m = /pt_pin=([^;]+)/.exec(ck);
  return m ? decodeURIComponent(m[1]) : '未知账号';
}

function readPref(key) {
  try {
    if (typeof $prefs !== 'undefined') return $prefs.valueForKey(key) || '';
    if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key) || '';
  } catch (e) {}
  return '';
}

// uuid/openudid: 40位hex, 从 pin 稳定派生（同账号每次一致, 避免设备指纹跳变）
function uuidOf(pin) {
  let h = 0x811c9dc5;
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  let out = '';
  let seed = h || 20261113;
  for (let i = 0; i < 40; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out += (seed % 16).toString(16);
  }
  return out;
}

// eid token: 京东 cookie 3AB9D23F7A4B3C9B 的值就是 x-api-eid-token（不带则不传）
function eidOf(ck) {
  const m = /3AB9D23F7A4B3C9B=([^;]+)/.exec(ck);
  return m ? m[1] : '';
}

// itemId: unix秒 + 4位随机（抓包实录格式; actionType 1 用素材自带 itemId）
function genItemId() {
  return String(Math.floor(Date.now() / 1000)) + String(Math.floor(1000 + Math.random() * 9000));
}

// ---------- 通用请求 ----------
function api(fid, body, ck, uuid) {
  const params = [
    'area=' + GEO.gps_area, 'clientVersion=16.1.50', 'client=apple', 'loginType=2',
    't=' + Date.now(), 'appid=' + APPID, 'xAPIClientLanguage=zh_CN',
    'functionId=' + fid, 'uuid=' + uuid,
    'd_model=iPhone17%2C2', 'd_brand=iPhone', 'model=iPhone17%2C2',
    'osVersion=27.0', 'adid=', 'openudid=' + uuid,
  ].join('&');
  let form = 'body=' + encodeURIComponent(JSON.stringify(body));
  const eid = eidOf(ck);
  if (eid) form += '&x-api-eid-token=' + eid;
  return new Promise(resolve => {
    const done = (ok, resp) => {
      let json = null;
      try { json = JSON.parse(resp); } catch (e) {}
      resolve({ ok, status: 0, json, raw: resp });
    };
    if (typeof $task !== 'undefined' && $task.fetch) {
      $task.fetch({
        url: 'https://api.m.jd.com/?' + params,
        method: 'POST',
        headers: {
          'Cookie': ck,
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://pro.m.jd.com',
          'Referer': ACT_PAGE + '?babelChannel=' + BABEL_CHANNEL + '&transparent=1&clickIndex=1&visitScene=1',
          'x-referer-page': ACT_PAGE,
          'x-rp-client': 'h5_2.6.0',
          'request-from': 'native',
        },
        body: form,
        timeout: TIMEOUT,
      }).then(
        resp => {
          const code = resp.statusCode || resp.status;
          const body = resp.body != null ? resp.body : (resp.content || '');
          let json = null;
          try { json = JSON.parse(body); } catch (e) {}
          resolve({ ok: code >= 200 && code < 300, status: code, json, raw: body });
        },
        err => resolve({ ok: false, status: 0, json: null, raw: String((err && (err.error || err.message)) || err) })
      );
    } else if (typeof $httpClient !== 'undefined' && $httpClient.post) {
      $httpClient.post({
        url: 'https://api.m.jd.com/?' + params,
        headers: {
          'Cookie': ck, 'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://pro.m.jd.com', 'Referer': ACT_PAGE, 'x-rp-client': 'h5_2.6.0',
        },
        body: form,
      }, (error, response, data) => {
        if (error) return resolve({ ok: false, status: 0, json: null, raw: String(error) });
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        const code = (response && (response.statusCode || response.status)) || 0;
        resolve({ ok: code >= 200 && code < 300, status: code, json, raw: data });
      });
    } else {
      // Node 自检通道
      const mod = require('https');
      const req = mod.request('https://api.m.jd.com/?' + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': ck,
          'User-Agent': UA, 'Origin': 'https://pro.m.jd.com', 'Referer': ACT_PAGE,
          'x-rp-client': 'h5_2.6.0', 'request-from': 'native',
        },
      }, res => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch (e) {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, raw: buf });
        });
      });
      req.on('error', e => resolve({ ok: false, status: 0, json: null, raw: String(e) }));
      req.write(form);
      req.end();
      void done; // 统一走 resolve, done 仅占位
    }
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 带随机抖动的间隔（±20%）, 避免固定节奏被识别为脚本
const gap = base => sleep(Math.round(base * (0.8 + Math.random() * 0.4)));

// ---------- 每日签到 ----------
async function dailySign(ck, uuid) {
  const body = Object.assign({
    channelId: '6',
    encryptProjectId: SIGN_PROJECT,
    encryptAssignmentId: SIGN_ASSIGN,
    todayAward: '1',
  }, GEO);
  const r = await api('billion_sign_info', body, ck, uuid);
  if (!r.json || r.json.code !== 0) return { ok: false, msg: '签到接口 ' + ((r.json && r.json.message) || r.raw.slice(0, 60)) };
  const si = r.json.data && r.json.data.result && r.json.data.result.signInfo;
  const rewards = (r.json.data.result && r.json.data.result.rewards) || [];
  const beans = rewards.filter(x => x.rewardType === '3' || x.rewardType === 3).reduce((s, x) => s + (x.quantity || 0), 0);
  return { ok: true, msg: si && si.todaySign === '1' ? '已签(第' + (si.signDays || '?') + '天) +' + beans + '豆' : '已签 +' + beans + '豆', beans };
}

// ---------- 任务列表 ----------
async function taskList(ck, uuid) {
  const r = await api('common_task_list', {
    channelId: CHANNEL_ID, babelChannel: BABEL_CHANNEL, activityId: ACT_ID,
    ext: { channel: 0, queryReceiveTimes: 1 },
  }, ck, uuid);
  if (!r.json || r.json.code !== 0) return null;
  const tl = r.json.data && r.json.data.result && r.json.data.result.taskInfo && r.json.data.result.taskInfo.taskList;
  return Array.isArray(tl) ? tl : null;
}

// ---------- 做一个任务一轮 ----------
// 返回 {done, beans, coupons, msg}
async function doOneRound(task, ck, uuid) {
  const wait = (task.ext && task.ext.waitDuration) || 0;
  const mats = (task.ext && task.ext.shoppingActivity) || [];
  const mat = mats.length ? mats[Math.floor(Math.random() * mats.length)] : null;
  const startId = (mat && mat.itemId) || genItemId();
  const jumpUrl = (mat && mat.url) || '';

  if (wait > 0) {
    // 等待类: 先 actionType 1 开始（带素材 itemId + jumpUrl）
    const s = await api('common_do_task', Object.assign({
      channelId: CHANNEL_ID, itemId: startId, assignmentId: task.encryptAssignmentId,
      ext: { jumpUrl }, actionType: 1,
    }, GEO), ck, uuid);
    const sr = s.json && s.json.data && s.json.data.result;
    if (!sr) return { done: false, msg: '开始405/' + ((s.json && s.json.message) || '').slice(0, 20) };
    const sub = sr.assignmentResult || {};
    if (String(sub.subCode) !== '1' && String(sub.subCode) !== '0') {
      return { done: false, msg: '开始' + sub.subCode + '/' + String(sub.msg || '').slice(0, 24) };
    }
    await sleep((wait + 3) * 1000);
  }

  // 领奖: actionType 0 + doReceiveRewards 1
  const c = await api('common_do_task', Object.assign({
    channelId: CHANNEL_ID, itemId: genItemId(), assignmentId: task.encryptAssignmentId,
    actionType: 0, ext: { doReceiveRewards: 1 },
  }, GEO), ck, uuid);
  const cr = c.json && c.json.data && c.json.data.result;
  if (!cr) return { done: false, msg: '领奖405/' + ((c.json && c.json.message) || '').slice(0, 20) };
  const sub = cr.assignmentResult || {};
  if (String(sub.subCode) !== '0') return { done: false, msg: '领奖' + sub.subCode + '/' + String(sub.msg || '').slice(0, 24) };
  const got = { done: true, beans: 0, coupons: 0, msg: '' };
  const sr = sub.rewardsInfo && sub.rewardsInfo.successRewards;
  if (sr) {
    const parts = [];
    for (const k in sr) for (const rw of sr[k]) {
      const n = (rw.rewardName || '') + 'x' + (rw.quantity || 0);
      parts.push(n);
      if (/京豆/.test(rw.rewardName || '')) got.beans += rw.quantity || 0;
      if (/券/.test(rw.rewardName || '')) got.coupons += rw.quantity || 0;
    }
    got.msg = parts.join(',') || '无奖励';
  } else got.msg = '完成(池空)';
  return got;
}

// ---------- 单账号主流程 ----------
async function runAccount(ck, idx, total) {
  const pin = pinOf(ck);
  const uuid = uuidOf(pin);
  const lines = [];
  let beans = 0;

  // 1. 每日签到
  try {
    const s = await dailySign(ck, uuid);
    lines.push((s.ok ? '✅ 签到: ' : '⚠️ 签到: ') + s.msg);
    if (s.beans) beans += s.beans;
  } catch (e) { lines.push('⚠️ 签到异常: ' + e.message); }
  await gap(GAP_TASK); // 签到与任务列表之间停顿

  // 2. 任务列表
  const tasks = await taskList(ck, uuid);
  if (!tasks) {
    lines.push('❌ 任务列表获取失败（Cookie 失效跑 CK检测; 或账号被风控——频繁调用触发"活动火爆"405, 冷却几小时再试）');
    return { pin, lines, beans };
  }

  const wantCoupon = readPref('JD_SUPER_COUPON') !== 'false';
  const todo = tasks.filter(t => {
    if (t.assignmentType !== 1) return false;                       // 助力类(type2)不做
    if (t.completionFlag) return false;
    if ((t.completionCnt || 0) >= (t.assignmentTimesLimit || 0)) return false;
    if (!(t.rewards || []).length) return false;                    // 无奖励的不做
    const name = t.assignmentName || '';
    if (SKIP_NAME.some(k => name.indexOf(k) >= 0)) return false;
    if (!wantCoupon && COUPON_NAME.some(k => name.indexOf(k) >= 0)) return false;
    return true;
  });
  lines.push('📋 可做任务 ' + todo.length + '/' + tasks.length + ' 个');

  // 3. 逐个任务做到满次数（串行: 一个任务全部轮次做完, 才做下一个任务）
  let blockCnt = 0; // 连续 405 计数
  for (const t of todo) {
    const remain = (t.assignmentTimesLimit || 1) - (t.completionCnt || 0);
    let okCnt = 0;
    for (let i = 0; i < remain; i++) {
      if (i > 0) await gap(GAP_ROUND); // 同任务轮与轮之间停顿
      const r = await doOneRound(t, ck, uuid);
      if (r.done) {
        okCnt++;
        beans += r.beans || 0;
        console.log('[' + pin + '] ' + t.assignmentName + ' 第' + (okCnt) + '轮: ' + r.msg);
        blockCnt = 0;
      } else {
        console.log('[' + pin + '] ' + t.assignmentName + ' 失败: ' + r.msg);
        if (/405/.test(r.msg)) { blockCnt++; if (blockCnt >= 2) { lines.push('⛔ 连续风控405, 停止该账号剩余任务（冷却几小时再跑）'); return { pin, lines, beans }; } }
        break; // 该任务失败, 换下一个
      }
    }
    if (okCnt) lines.push('✅ ' + t.assignmentName + ' x' + okCnt);
    await gap(GAP_TASK); // 任务与任务之间停顿（无论成败）
  }
  return { pin, lines, beans };
}

// ---------- 入口 ----------
(async () => {
  const cookies = readCookies();
  if (!cookies.length) {
    console.log('未找到京东 Cookie（BoxJs CookiesJD / CookieJD）');
    if (typeof $notify !== 'undefined') $notify('国补×超补', '未找到 Cookie', '请先打开京东 App 抓取');
    return;
  }
  console.log('=== 国补×超补 频道任务, ' + cookies.length + ' 个账号（串行执行: 账号逐个来, 任务逐个做）===');
  const all = [];
  for (let i = 0; i < cookies.length; i++) {
    if (i > 0) await gap(GAP_ACCOUNT); // 账号与账号之间停顿
    console.log('--- 账号 ' + (i + 1) + '/' + cookies.length + ': ' + pinOf(cookies[i]) + ' ---');
    try {
      const r = await runAccount(cookies[i], i, cookies.length);
      all.push(r);
    } catch (e) {
      all.push({ pin: pinOf(cookies[i]), lines: ['❌ 账号异常: ' + e.message], beans: 0 });
    }
  }
  // 通知
  const totalBeans = all.reduce((s, x) => s + (x.beans || 0), 0);
  const title = '国补×超补' + (all.length > 1 ? ' x' + all.length : '') + (totalBeans ? ' +' + totalBeans + '豆' : '');
  const body = all.map(a => '【' + a.pin + '】\n' + a.lines.join('\n')).join('\n\n');
  console.log('\n=== 汇总 ===\n' + body);
  if (typeof $notify !== 'undefined') $notify(title, '', body);
})().catch(e => {
  console.log('脚本异常: ' + ((e && e.stack) || e));
  if (typeof $notify !== 'undefined') $notify('国补×超补', '脚本异常', String((e && e.message) || e));
});
