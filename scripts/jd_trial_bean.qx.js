/**
 * 京东试用频道领京豆 (jd_trial_bean) — 京东「1分购 / 试用」活动页任务自动化
 *
 * 覆盖活动页: https://pro.m.jd.com/mall/active/G7sQ92vWSBsTHzk4e953qUGWQJ4/index.html
 *   （京东App 搜索「1分购」进入的试用频道页，页内"领京豆"任务，每个 5~15 京豆）
 *
 * 原理（2026-10-08 抓包逆向）:
 *   1. functionId=qryH5BabelFloors（appid=newtry）拉活动楼层，
 *      响应内嵌 AssignmentDetail 任务列表（encryptAssignmentId / completionFlag / rewards[京豆]）
 *   2. 对 completionFlag=false 的任务逐个调 functionId=common_do_task 领取，
 *      从响应 rewardsInfo.successRewards 汇总京豆数
 *   3. 两个接口均无需 h5st 签名（实测只校验 Cookie 登录态）。
 *      软拒绝有两层，都按可重试处理：
 *      - 业务层 bizCode -100/-101「当前参与人数较多/过多」
 *      - 接口层 code 404/405「活动火爆，请稍后再试」
 *      引导类任务（如"固坑引导"）需在 App 内完成引导动作，直领会一直软拒绝，属预期。
 *      Cookie 失效时查询返回空响应体/未登录，脚本会明确提示。
 *
 * Cookie 来源（按优先级，多账号按 pt_pin 去重）:
 *   1. 青龙面板（推荐，配置 JD_QL_URL/JD_QL_CLIENT_ID/JD_QL_CLIENT_SECRET）:
 *      青龙 → 应用设置 → 新建应用 → 权限勾选「环境管理-查看」→ 得 client_id/client_secret
 *      读取全部 JD_COOKIE 环境变量（多账号换行分隔）。连接失败自动回退本地 Cookie。
 *   2. Quantumult X 本地: BoxJs 键 CookiesJD（由 qx_jd_all.js 抓取 rewrite 自动维护）
 *   3. Node 调试: 环境变量 JD_COOKIES（多账号换行分隔）或 JD_COOKIE（单账号）
 *
 * 可调参数:
 *   JD_TRIAL_RETRY      软拒绝重试次数，默认 2
 *   JD_TRIAL_RETRY_WAIT 重试间隔毫秒，默认 5000
 *   JD_NTFY_TOPIC       ntfy 外推主题，留空仅本地通知
 *
 * [task_local]
 * 17 9,16 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/jd_trial_bean.qx.js, tag=试用领京豆, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jd_bean_home.png, enabled=true
 */

// ==================== 环境判断 ====================
var IS_QX = typeof $task !== 'undefined' && typeof $task.fetch === 'function';
var IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// ==================== 配置 ====================
function getConf(key, dft) {
  try { if (IS_NODE && process.env[key]) return process.env[key]; } catch (_) {}
  try {
    if (typeof $prefs !== 'undefined') { var v = $prefs.valueForKey(key); if (v) return v; }
  } catch (_) {}
  try {
    if (typeof $persistentStore !== 'undefined') { var v2 = $persistentStore.read(key); if (v2) return v2; }
  } catch (_) {}
  return dft;
}

// 活动页参数（抓包固定值；京东改版时重新抓包更新这几项即可）
var ACT_ID = 'G7sQ92vWSBsTHzk4e953qUGWQJ4';   // encodeActivityId
var PAGE_ID = '5366891';
var FLOOR_ID = '122572153';
var BABEL_CHANNEL = 'ttt63';
var CLIENT_VERSION = '16.0.70';

var RETRY = parseInt(getConf('JD_TRIAL_RETRY', '2'), 10);
var RETRY_WAIT = parseInt(getConf('JD_TRIAL_RETRY_WAIT', '5000'), 10);
var NTFY_TOPIC = getConf('JD_NTFY_TOPIC', '');
var QL_URL = (getConf('JD_QL_URL', '') || '').replace(/\/+$/, '');
var QL_ID = getConf('JD_QL_CLIENT_ID', '');
var QL_SECRET = getConf('JD_QL_CLIENT_SECRET', '');

var UA = 'jdapp;iPhone;' + CLIENT_VERSION + ';;;M/5.0;appBuild/171012;jdSupportDarkMode/0;lang/zh_CN;ctype/0;site/CN;ccy/CNY;elder/0;ef/1;Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1;';

// ==================== HTTP ====================
function qxFetch(opts) {
  return new Promise(function (resolve, reject) {
    $task.fetch(opts).then(
      function (r) {
        if (r.body === undefined || r.body === null) {
          reject(new Error('HTTP ' + r.status + ' 空响应（疑似京东风控限频，或 Cookie 已失效）'));
        } else { resolve({ status: r.status, body: r.body }); }
      },
      function (e) { reject(new Error((e && (e.error || e.message)) || 'fetch失败')); }
    );
  });
}

function nodeRequest(url, method, headers, body) {
  return new Promise(function (resolve, reject) {
    var mod = require(url.indexOf('https:') === 0 ? 'https' : 'http');
    var req = mod.request(url, {
      method: method,
      headers: body ? Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(body) }) : headers
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.setTimeout(15000, function () { req.destroy(new Error('请求超时(15s)')); });
    req.on('error', reject);
    if (body) req.write(body); else req.end();
  });
}

function http(method, url, headers, body) {
  if (IS_QX) return qxFetch(Object.assign({ url: url, method: method, headers: headers }, body ? { body: body } : {}));
  return nodeRequest(url, method, headers, body);
}

function postForm(url, formObj, headers) {
  var body = '';
  for (var k in formObj) body += (body ? '&' : '') + k + '=' + formObj[k];
  var h = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://pro.m.jd.com',
    'Referer': 'https://pro.m.jd.com/mall/active/' + ACT_ID + '/index.html',
    'x-rp-client': 'h5_2.4.0',
    'User-Agent': UA
  };
  for (var k2 in (headers || {})) h[k2] = headers[k2];
  return http('POST', url, h, body);
}

// appid=newtry 的 H5 网关：URL 带 client 参数，form 里只放 body（实测无需 h5st / x-api-eid-token）
function apiUrl(functionId) {
  return 'https://api.m.jd.com/?area=1_72_55657_0&clientVersion=' + CLIENT_VERSION +
    '&client=apple&loginType=2&t=' + Date.now() +
    '&appid=newtry&xAPIClientLanguage=zh_CN&functionId=' + functionId;
}

// 接口层软拒绝：code 403/404/405「活动火爆，请稍后再试」等，可重试
function isSoftMsg(msg) {
  return /人数较多|人数过多|稍后再试|活动火爆|请重试/.test(msg || '');
}

// 单次调用：解析 + 错误分类。软拒绝抛 e.soft=true，由调用方决定是否重试
async function jdApi(functionId, bodyObj, cookie) {
  var form = { body: JSON.stringify(bodyObj) };
  var r = await postForm(apiUrl(functionId), form, { Cookie: cookie });
  var data;
  try { data = JSON.parse(r.body); } catch (e) {
    var hint = (r.status === 403 || r.status === 412 || r.body === '') ? '疑似京东风控限频，请降低频率后重试' : '响应异常';
    throw new Error('HTTP ' + r.status + ' ' + hint + ': ' + String(r.body).slice(0, 60));
  }
  if (String(data.code) !== '0' && String(data.code) !== '200') {
    var msg = data.message || data.msg || ('code=' + data.code);
    var err = new Error(msg);
    err.soft = isSoftMsg(msg) || data.code === 403 || data.code === 404 || data.code === 405;
    throw err;
  }
  return data;
}

function httpPostJson(url, obj, extraHeaders) {
  var body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  var h = { 'Content-Type': 'application/json' };
  for (var k in (extraHeaders || {})) h[k] = extraHeaders[k];
  return http('POST', url, h, body);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ==================== Cookie 来源 ====================
function pinOf(cookie) {
  var m = /pt_pin=([^;]+)/.exec(cookie);
  try { return m ? decodeURIComponent(m[1]) : '?'; } catch (_) { return m ? m[1] : '?'; }
}

function addCookie(out, seen, ck) {
  ck = (ck || '').trim();
  if (ck.indexOf('pt_key=') < 0) return;
  var pin = pinOf(ck);
  if (pin === '?' || seen[pin]) return;
  seen[pin] = true;
  out.push({ cookie: ck, pin: pin });
}

// 青龙面板：client_id/secret 换 token，再拉全部 JD_COOKIE（多账号换行分隔）
async function cookiesFromQinglong() {
  var tokenResp = await http('GET',
    QL_URL + '/open/auth/token?client_id=' + encodeURIComponent(QL_ID) + '&client_secret=' + encodeURIComponent(QL_SECRET),
    { 'Accept': 'application/json' }, null);
  var tokenData = JSON.parse(tokenResp.body);
  if (!tokenData || !tokenData.data || !tokenData.data.token) {
    throw new Error('青龙鉴权失败: ' + String(tokenResp.body).slice(0, 120));
  }
  var envResp = await http('GET', QL_URL + '/open/envs?searchValue=JD_COOKIE',
    { 'Accept': 'application/json', 'Authorization': 'Bearer ' + tokenData.data.token }, null);
  var envData = JSON.parse(envResp.body);
  if (String(envData.code) !== '200') {
    throw new Error('青龙读取环境变量失败: ' + String(envResp.body).slice(0, 120));
  }
  var items = envData.data && envData.data.data ? envData.data.data : envData.data;
  var out = [], seen = {};
  for (var i = 0; i < items.length; i++) {
    if ((items[i].name || '') !== 'JD_COOKIE') continue;
    var lines = String(items[i].value || '').split('\n');
    for (var j = 0; j < lines.length; j++) addCookie(out, seen, lines[j]);
  }
  return out;
}

function cookiesLocal() {
  var out = [], seen = {};
  if (IS_QX) {
    try {
      var arr = JSON.parse(getConf('CookiesJD', '[]'));
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].cookie) addCookie(out, seen, arr[i].cookie);
        }
      }
    } catch (_) {}
  } else {
    var multi = getConf('JD_COOKIES', '');
    if (multi) {
      multi.split('\n').forEach(function (l) { addCookie(out, seen, l); });
    }
    if (!out.length) addCookie(out, seen, getConf('JD_COOKIE', ''));
  }
  return out;
}

async function collectCookies() {
  if (QL_URL && QL_ID && QL_SECRET) {
    try {
      var fromQl = await cookiesFromQinglong();
      if (fromQl.length) return { list: fromQl, src: '青龙(' + fromQl.length + '账号)' };
      console.log('青龙上没有可用的 JD_COOKIE，回退本地 Cookie');
    } catch (e) {
      console.log('青龙连接失败(' + ((e && e.message) || e) + ')，回退本地 Cookie');
    }
  }
  return { list: cookiesLocal(), src: IS_QX ? 'CookiesJD' : '环境变量' };
}

// ==================== 任务列表 ====================
// 递归收集响应里所有 AssignmentDetail 节点（任务列表挂在楼层 providerData 深处，楼层号可能变化）
function walkAssignments(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) walkAssignments(node[i], out);
    return;
  }
  if (node.encryptAssignmentId) {
    out.push(node);
    return;
  }
  for (var k in node) walkAssignments(node[k], out);
}

async function queryTasks(cookie) {
  var resp = await jdApi('qryH5BabelFloors', {
    activityId: ACT_ID,
    pageId: PAGE_ID,
    siteClient: 'm',
    siteClientVersion: '',
    queryFloorsParam: {
      floorParams: (function () { var m = {}; m[FLOOR_ID] = { babelChannel: BABEL_CHANNEL }; return m; })(),
      type: '2'
    }
  }, cookie);
  if (resp.isLogin === false) throw new Error('Cookie 已失效，请更新 JD_COOKIE');
  if (String(resp.code) !== '0') throw new Error('查询任务失败: ' + (resp.msg || resp.message || JSON.stringify(resp).slice(0, 120)));
  var list = [];
  walkAssignments(resp, list);
  var tasks = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    var rewardDesc = [];
    var beans = 0;
    var rewards = a.rewards || [];
    for (var j = 0; j < rewards.length; j++) {
      var r = rewards[j];
      var name = r.rewardName || r.prizeName || '?';
      if (name === '京豆') beans += parseInt(r.quantity, 10) || 0;
      else rewardDesc.push(name);
    }
    tasks.push({
      id: a.encryptAssignmentId,
      name: a.assignmentName || '试用任务',
      done: !!a.completionFlag,
      beans: beans,
      extra: rewardDesc.join(' / ')
    });
  }
  return tasks;
}

// ==================== 领取 ====================
function sumBeans(resp) {
  var beans = 0, others = [];
  try {
    var sr = resp.data.result.assignmentResult.rewardsInfo.successRewards;
    for (var k in sr) {
      var arr = sr[k] || [];
      for (var i = 0; i < arr.length; i++) {
        var name = arr[i].rewardName || arr[i].prizeName || '?';
        if (name === '京豆') beans += parseInt(arr[i].quantity, 10) || 0;
        else others.push(name + '×' + arr[i].quantity);
      }
    }
  } catch (_) {}
  return { beans: beans, others: others };
}

// 领取重试策略：京豆类任务软拒绝可重试；引导类任务（奖励非"京豆"，需App内动作）
// 实测直领必被拒，只试一次，省请求量降低触发风控的概率
async function claimTask(cookie, task, allowRetry) {
  var body = {
    channelId: '20',
    itemId: '1',
    assignmentId: task.id,
    actionType: '0',
    ext: { queryReceiveTimes: 1, doReceiveRewards: 1 },
    extMap: { sceneType: 1, babelChannel: BABEL_CHANNEL }
  };
  var lastMsg = '';
  for (var attempt = 0; attempt <= (allowRetry ? RETRY : 0); attempt++) {
    if (attempt > 0) await sleep(RETRY_WAIT);
    var resp;
    try {
      resp = await jdApi('common_do_task', body, cookie);
    } catch (e) {
      lastMsg = (e && e.message) || String(e);
      if (!(e && e.soft) || !allowRetry) break;
      continue;
    }
    var bizCode = resp.data && resp.data.bizCode;
    var bizMsg = resp.data && resp.data.bizMsg;
    if (bizCode === 0) {
      var s = sumBeans(resp);
      return { ok: true, beans: s.beans, extra: s.others.join(' / ') };
    }
    lastMsg = bizMsg || resp.message || ('bizCode=' + bizCode);
    if (!isSoftMsg(lastMsg) || !allowRetry) break;
  }
  return { ok: false, msg: lastMsg };
}

// ==================== 主流程 ====================
async function runAccount(acc, tag) {
  var log = [];
  function p(s) { log.push(s); console.log('[' + tag + '] ' + s); }

  var tasks;
  try {
    tasks = await queryTasks(acc.cookie);
  } catch (e) {
    p('❌ 查询任务失败: ' + ((e && e.message) || e));
    return log.join('\n');
  }
  if (!tasks.length) { p('活动页未返回任务（可能已下线，活动参数需更新）'); return log.join('\n'); }

  var doneCnt = 0, gotBeans = 0, gotExtra = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var label = t.name + (t.beans ? '（' + t.beans + '京豆）' : (t.extra ? '（' + t.extra + '）' : ''));
    if (t.done) { doneCnt++; p('· ' + label + ' 已领取'); continue; }
    var r;
    try {
      r = await claimTask(acc.cookie, t, t.beans > 0);
    } catch (e) {
      r = { ok: false, msg: (e && e.message) || String(e) };
    }
    if (r.ok) {
      gotBeans += r.beans;
      if (r.extra) gotExtra.push(r.extra);
      p('✅ ' + label + ' +' + r.beans + '京豆' + (r.extra ? ' +' + r.extra : ''));
    } else {
      p('⚠️ ' + label + ' 领取失败: ' + r.msg);
    }
    if (i < tasks.length - 1) await sleep(2000);
  }
  var head = '共' + tasks.length + '个任务，已领' + doneCnt + '，本次' + (gotBeans ? '+' + gotBeans + '京豆' : '无新增');
  if (gotExtra.length) head += '（另有: ' + gotExtra.join('、') + '）';
  log.unshift(head);
  console.log('[' + tag + '] ' + head);
  return log.join('\n');
}

async function main() {
  var src = await collectCookies();
  var cookies = src.list;
  console.log('Cookie 来源: ' + src.src);
  if (!cookies.length) {
    console.log('未找到京东 Cookie：QX 下请先运行一次京东App让 qx_jd_all.js 抓取，或在 BoxJs 配置青龙 JD_QL_*；Node 下请设置 JD_COOKIES');
    if (IS_QX && typeof $done !== 'undefined') $done({});
    return;
  }
  var all = [];
  for (var i = 0; i < cookies.length; i++) {
    if (i > 0) await sleep(8000);   // 账号间拉开间隔，降低触发京东风控限频的概率
    var acc = cookies[i];
    var tag = '账号' + (i + 1) + '(' + acc.pin + ')';
    try {
      all.push('【' + acc.pin + '】\n' + await runAccount(acc, tag));
    } catch (e) {
      var msg = (e && e.message) || e;
      console.log('[' + tag + '] 执行失败: ' + msg);
      all.push('【' + acc.pin + '】执行失败: ' + msg);
    }
  }
  var title = '京东试用领京豆';
  var detail = all.join('\n\n');
  try { if (typeof $notify !== 'undefined') $notify(title, '', detail); } catch (_) {}
  try { if (typeof $notification !== 'undefined') $notification.post(title, '', detail); } catch (_) {}
  if (NTFY_TOPIC && NTFY_TOPIC !== 'false') {
    try {
      await httpPostJson('https://ntfy.sh/' + NTFY_TOPIC, detail, { Title: encodeURIComponent(title) });
    } catch (e) { console.log('ntfy 推送失败: ' + e.message); }
  }
  if (IS_QX && typeof $done !== 'undefined') $done({});
}

main();
