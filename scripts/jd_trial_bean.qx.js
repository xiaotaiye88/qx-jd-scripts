/**
 * 京东试用频道领京豆 (jd_trial_bean) — 京东「1分购 / 试用」活动页任务自动化
 *
 * 覆盖活动页: https://pro.m.jd.com/mall/active/G7sQ92vWSBsTHzk4e953qUGWQJ4/index.html
 *   （京东App 搜索「1分购」进入的试用频道页，页内"领京豆"任务，每个 5~10 京豆）
 *
 * 原理（2026-10-08 抓包逆向）:
 *   1. functionId=qryH5BabelFloors（appid=newtry）拉活动楼层，
 *      响应内嵌 AssignmentDetail 任务列表（encryptAssignmentId / completionFlag / rewards[京豆]）
 *   2. 对 completionFlag=false 的任务逐个调 functionId=common_do_task 领取，
 *      从响应 rewardsInfo.successRewards 汇总京豆数
 *   3. 两个接口均无需 h5st 签名（实测只校验 Cookie 登录态；
 *      任务不可领时返回 bizCode -100/-101「当前参与人数较多/过多」文案，
 *      引导类任务（如"固坑引导"）需在 App 内完成引导动作，脚本直领会返回 -101）
 *
 * Cookie 来源（与 jd_bean_guagua 一致）:
 *   - Quantumult X: BoxJs 键 CookiesJD（由 qx_jd_all.js 抓取 rewrite 自动维护）
 *   - Node 调试:    环境变量 JD_COOKIE（格式 pt_key=xxx;pt_pin=yyy;）
 *
 * 可调参数（Node 环境变量）:
 *   JD_TRIAL_RETRY      领取失败(-1xx)重试次数，默认 2
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

var UA = 'jdapp;iPhone;' + CLIENT_VERSION + ';;;M/5.0;appBuild/171012;jdSupportDarkMode/0;lang/zh_CN;ctype/0;site/CN;ccy/CNY;elder/0;ef/1;Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1;';

// ==================== HTTP ====================
function httpPostForm(url, formObj, headers) {
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
  if (IS_QX) {
    return new Promise(function (resolve, reject) {
      $task.fetch({ url: url, method: 'POST', headers: h, body: body }).then(
        function (r) { resolve(r.body); },
        function (e) { reject(new Error(e && (e.error || e.message) || 'fetch失败')); }
      );
    });
  }
  return new Promise(function (resolve, reject) {
    require('https').request(url, { method: 'POST', headers: Object.assign({}, h, { 'Content-Length': Buffer.byteLength(body) }) },
      function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      }).on('error', reject).write(body);
  });
}

// appid=newtry 的 H5 网关：URL 带 client 参数，form 里只放 body（实测无需 h5st / x-api-eid-token）
function apiUrl(functionId) {
  return 'https://api.m.jd.com/?area=1_72_55657_0&clientVersion=' + CLIENT_VERSION +
    '&client=apple&loginType=2&t=' + Date.now() +
    '&appid=newtry&xAPIClientLanguage=zh_CN&functionId=' + functionId;
}

async function jdApi(functionId, bodyObj, cookie) {
  var form = { body: JSON.stringify(bodyObj) };
  var txt = await httpPostForm(apiUrl(functionId), form, { Cookie: cookie });
  var data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error('响应非JSON: ' + String(txt).slice(0, 120)); }
  return data;
}

function httpPostJson(url, obj, extraHeaders) {
  var body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  var h = { 'Content-Type': 'application/json' };
  for (var k in (extraHeaders || {})) h[k] = extraHeaders[k];
  if (IS_QX) {
    return new Promise(function (resolve, reject) {
      $task.fetch({ url: url, method: 'POST', headers: h, body: body }).then(
        function (r) { resolve(r.body); },
        function (e) { reject(new Error(e && (e.error || e.message) || 'fetch失败')); }
      );
    });
  }
  return new Promise(function (resolve, reject) {
    require('https').request(url, { method: 'POST', headers: Object.assign({}, h, { 'Content-Length': Buffer.byteLength(body) }) },
      function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      }).on('error', reject).write(body);
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ==================== Cookie ====================
function collectCookies() {
  var out = [];
  if (IS_QX) {
    var raw = getConf('CookiesJD', '[]');
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].cookie && arr[i].cookie.indexOf('pt_key=') >= 0) out.push(arr[i].cookie);
        }
      }
    } catch (_) {}
  } else {
    var envCk = getConf('JD_COOKIE', '');
    if (envCk) out.push(envCk);
  }
  return out;
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
  if (resp.isLogin === false) throw new Error('Cookie 已失效，请打开京东App触发一次抓包');
  if (String(resp.code) !== '0') throw new Error('查询任务失败: ' + (resp.msg || JSON.stringify(resp).slice(0, 120)));
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

// 业务软拒绝(-100/-101「参与人数较多/过多」)按配置重试
function isSoftReject(bizCode, bizMsg) {
  return bizCode === -100 || bizCode === -101 || /人数较多|人数过多|稍后再试/.test(bizMsg || '');
}

async function claimTask(cookie, task) {
  var body = {
    channelId: '20',
    itemId: '1',
    assignmentId: task.id,
    actionType: '0',
    ext: { queryReceiveTimes: 1, doReceiveRewards: 1 },
    extMap: { sceneType: 1, babelChannel: BABEL_CHANNEL }
  };
  var lastMsg = '';
  for (var attempt = 0; attempt <= RETRY; attempt++) {
    if (attempt > 0) await sleep(RETRY_WAIT);
    var resp = await jdApi('common_do_task', body, cookie);
    if (String(resp.code) !== '0') { lastMsg = '接口异常 code=' + resp.code; continue; }
    var bizCode = resp.data && resp.data.bizCode;
    var bizMsg = resp.data && resp.data.bizMsg;
    if (bizCode === 0) {
      var s = sumBeans(resp);
      return { ok: true, beans: s.beans, extra: s.others.join(' / ') };
    }
    lastMsg = bizMsg || ('bizCode=' + bizCode);
    if (!isSoftReject(bizCode, bizMsg)) break;
  }
  return { ok: false, msg: lastMsg };
}

// ==================== 主流程 ====================
async function runAccount(cookie, tag) {
  var log = [];
  function p(s) { log.push(s); console.log('[' + tag + '] ' + s); }

  var tasks = await queryTasks(cookie);
  if (!tasks.length) { p('活动页未返回任务（可能已下线，活动参数需更新）'); return log.join('\n'); }

  var doneCnt = 0, gotBeans = 0, gotExtra = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var label = t.name + (t.beans ? '（' + t.beans + '京豆）' : (t.extra ? '（' + t.extra + '）' : ''));
    if (t.done) { doneCnt++; p('· ' + label + ' 已领取'); continue; }
    var r = await claimTask(cookie, t);
    if (r.ok) {
      gotBeans += r.beans;
      if (r.extra) gotExtra.push(r.extra);
      p('✅ ' + label + ' +' + r.beans + '京豆' + (r.extra ? ' +' + r.extra : ''));
    } else {
      p('⚠️ ' + label + ' 领取失败: ' + r.msg);
    }
    await sleep(1200);
  }
  var head = '共' + tasks.length + '个任务，已领' + doneCnt + '，本次' + (gotBeans ? '+' + gotBeans + '京豆' : '无新增');
  if (gotExtra.length) head += '（另有: ' + gotExtra.join('、') + '）';
  log.unshift(head);
  console.log('[' + tag + '] ' + head);
  return log.join('\n');
}

async function main() {
  var cookies = collectCookies();
  if (!cookies.length) {
    console.log('未找到京东 Cookie：QX 下请先运行一次京东App让 qx_jd_all.js 抓取；Node 下请设置 JD_COOKIE');
    if (IS_QX && typeof $done !== 'undefined') $done({});
    return;
  }
  var all = [];
  for (var i = 0; i < cookies.length; i++) {
    var tag = '账号' + (i + 1);
    try {
      all.push(await runAccount(cookies[i], tag));
    } catch (e) {
      var msg = (e && e.message) || e;
      console.log('[' + tag + '] 执行失败: ' + msg);
      all.push(tag + ' 执行失败: ' + msg);
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
