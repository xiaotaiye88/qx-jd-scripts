/*
 * ================================================
 *  京东金融 - 赚京豆任务自动接取 - Quantumult X
 * ================================================
 * 功能：
 *   1. 拉取京豆任务列表（做任务领京豆二级页）
 *   2. 自动接取所有可接取的任务（接取后任务从列表消失）
 *   3. 复查剩余任务，输出摘要
 *   4. 触发风控时立即停手并提示重新打开 App
 *
 * 使用方法：
 *   [task_local]
 *   30 9 * * * https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/jdjr_coinquest.qx.js, tag=京东金融赚京豆, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jd_bean_home.png, enabled=true
 *
 *   [rewrite_local]
 *   ^https?://ms\.jr\.jd\.com/gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate\?pageType=11189 url script-request-body https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/jdjr_coinquest.qx.js
 *   (抓取 Cookie + 请求参数用。打开京东金融 App → 我的 → 京豆 → 做任务赚京豆，
 *    页面发任务列表请求时抓到，通知提示「已抓取参数」，抓到后可注释此规则。
 *    ⚠️ 必须用 script-request-body 类型：script-request-header 读不到请求体)
 *
 * 原理（逆向自 member.jr.jd.com/coinQuest H5 页面 main_712f8c1d1f.js）：
 *   - 任务列表: POST /gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate?pageType=11189
 *     body = reqData=...&cco=...&eid=...
 *     reqData 含风险签名字段（nonce/signature/deviceInfos/aarVersion）
 *     cco 含 h5st（由 AAR2 风控 SDK 生成，与设备绑定）
 *   - 接取任务: POST /gw2/generic/mission/newh5/m/receiveMissionForNa
 *     body = reqData={"environment":"2","missionId":"xxx","channelCode":"xxx",
 *                     "nonce":"...","signature":"...","deviceInfo1":{...},
 *                     "clientType":"h5","clientVersion":"8.2.30"}
 *     成功: {"resultData":{"msg":"接取成功","code":"0000","success":true}}
 *     已接取: {"resultData":{"msg":"已接取","code":"0013","success":false}}
 *
 * ⚠️ 风控说明（重要）：
 *   - 请求里的 nonce/signature/deviceInfo1/h5st 都是用户 iPhone 上 JDJR App
 *     内置风控 SDK 实时生成的，与设备绑定。
 *   - 本脚本通过 rewrite 抓取最近一次真实请求的参数并复用；
 *     若超过一段时间（如一天）没打开 App，参数过期会被风控拒绝。
 *   - 触发风控表现为 resultCode=20001400 "brush or crawler request"
 *     或 resultCode=3 "请先登录您的京东账号"（此时 App 内正常）。
 *   - 处理：脚本检测到后立即停止，通知用户重新打开 App 刷新参数。
 *   - 建议：不要频繁手动运行，每天定时一次即可。
 *
 * 数据存储（BoxJS）：
 *   jdjr_ck    - 京东金融 Cookie（自动抓取）
 *   jdjr_req   - 最近一次任务列表请求的 reqData（含风险签名）
 *   jdjr_req_ts - 参数抓取时间
 *
 * ================================================
 */

// ================= 配置区 =================
const CK_KEY = 'jdjr_ck';       // Cookie（单账号）
const REQ_KEY = 'jdjr_req';     // 任务列表请求参数（含风险签名）
const REQ_TS_KEY = 'jdjr_req_ts';

// 接取任务时的固定参数（来自真实抓包，environment=2 表示 iOS H5）
const RECEIVE_BASE = {
  environment: '2',
  clientType: 'h5',
  clientVersion: '8.2.30'
};

// 请求间隔（毫秒）—— 避免触发风控
const REQUEST_INTERVAL = 4000;
// 任务列表刷新等待（接取后等列表更新）
const LIST_REFRESH_DELAY = 3000;

// ==============================================
const $ = new Env('京东金融赚京豆');

// ---------- 数据读写 ----------
function getData(key) {
  try { return $.getdata(key); } catch (e) { return null; }
}
function setData(key, val) {
  try { $.setdata(val, key); } catch (e) {}
}

// ---------- 网络请求 ----------
// 优先使用抓取时保存的 App 真实请求头（headers），只补上 body 必需的 Content-Type 与 Cookie
// —— 与 App 真实请求保持一致，避免伪造头被网关/风控识别导致「网络异常」
function request(url, body, cookie, capturedHeaders) {
  return new Promise((resolve) => {
    const headers = {
      ...(capturedHeaders || {}),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie || ''
    };
    if (typeof $task !== 'undefined') {
      $task.fetch({ url, method: 'POST', headers, body })
        .then(resp => resolve(parseResponse(resp.body)))
        .catch(err => resolve({ error: err.message }));
    } else if (typeof $httpClient !== 'undefined') {
      $httpClient.post({ url, headers, body }, (err, resp, data) => {
        if (err) { resolve({ error: err.message }); return; }
        resolve(parseResponse(data));
      });
    } else {
      // Node.js 测试
      const https = require('https');
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(parseResponse(d)));
      });
      req.on('error', err => resolve({ error: err.message }));
      req.write(body);
      req.end();
    }
  });
}

function parseResponse(text) {
  try { return JSON.parse(text); } catch (e) { return { parseError: true, raw: String(text).slice(0, 200) }; }
}

// ---------- 风控判断 ----------
// 返回 true 表示被风控拦截，应立即停手
function isRiskBlocked(resp) {
  if (!resp || resp.parseError) return false;
  const code = String(resp.resultCode);
  if (code === '20001400') return true;           // brush or crawler request
  if (resp.resultData && resp.resultData.code === '0013') return false; // 已接取（正常）
  if (code === '3') {                              // 请先登录
    const msg = String(resp.resultMsg || '');
    // 只有真的说"请先登录"才算（有些成功响应 resultCode 可能为 3 吗？不，成功是 0）
    return /请先登录|未登录|登录已过期/.test(msg) || msg === '请先登录您的京东账号';
  }
  return false;
}

// ---------- 任务列表 ----------
// 用抓到的 reqData（含 cco/eid）拉取任务列表
async function fetchTaskList(cookie, savedReq) {
  if (!savedReq) return { risk: false, error: 'no_params' };
  const body = savedReq.body; // 完整的 reqData=...&cco=...&eid=...
  const resp = await request(
    'https://ms.jr.jd.com/gw2/generic/legogw/h5/m/getPageInfoSafetyTranslate?pageType=11189',
    body, cookie, savedReq.headers
  );
  if (isRiskBlocked(resp)) return { risk: true, resp };
  const rd = resp.resultData || {};
  const rl = rd.resultList || [];
  const taskTpl = rl.find(r => String(r.templateType) === '256610003');
  const tasks = (taskTpl && taskTpl.templateData && taskTpl.templateData.taskList) || [];
  return { risk: false, tasks, coin: extractCoin(rd) };
}

// 从 topData 提取当前京豆数
function extractCoin(rd) {
  try {
    const top = rd.topData || {};
    const part = top.part256570004 || {};
    const n = part.coinNumber || {};
    return n.text || '';
  } catch (e) { return ''; }
}

// ---------- 接取任务 ----------
async function receiveMission(cookie, mission, riskParams) {
  const reqData = {
    ...RECEIVE_BASE,
    missionId: String(mission.missionId),
    channelCode: mission.channelCode,
    nonce: riskParams.nonce,
    signature: riskParams.signature,
    deviceInfo1: riskParams.deviceInfo1
  };
  const body = 'reqData=' + encodeURIComponent(JSON.stringify(reqData));
  const resp = await request(
    'https://ms.jr.jd.com/gw2/generic/mission/newh5/m/receiveMissionForNa',
    body, cookie, riskParams.headers
  );
  if (isRiskBlocked(resp)) return { risk: true, resp };
  const d = resp.resultData || {};
  return { risk: false, ok: d.code === '0000', msg: d.msg || '', resp };
}

// ---------- 从抓取的列表请求解析风险参数 ----------
function parseRiskParams(savedReq) {
  if (!savedReq || !savedReq.body) return null;
  // body = reqData={...}&cco={...}&eid=xxx
  const m = savedReq.body.match(/^reqData=([^&]*)/);
  if (!m) return null;
  try {
    const rd = JSON.parse(decodeURIComponent(m[1]));
    const ep = rd.extParams || {};
    return {
      nonce: ep.nonce || '',
      signature: ep.signature || '',
      // deviceInfo1 用于接取接口；从列表请求的 extParams 派生
      deviceInfo1: {
        jsToken: (savedReq.cookie.match(/(?:^|; )3AB9D23F7A4B3CSS=([^;]+)/) || [])[1] || '',
        fp: ep.deviceInfos ? (JSON.parse(ep.deviceInfos).fp || '') : '',
        sdkToken: ep.sdkToken || '',
        eid: (savedReq.cookie.match(/(?:^|; )3AB9D23F7A4B3C9B=([^;]+)/) || [])[1] || ep.sdkToken || '',
        token: ep.sdkToken || ''
      },
      headers: savedReq.headers || null
    };
  } catch (e) {
    return null;
  }
}

// ---------- 主流程 ----------
async function main() {
  const cookie = getData(CK_KEY);
  const reqRaw = getData(REQ_KEY);
  const reqTs = parseInt(getData(REQ_TS_KEY)) || 0;

  if (!cookie || !reqRaw) {
    const hint = '未找到京东金融 Cookie/请求参数。\n请先打开京东金融 App → 我的 → 京豆 → 做任务赚京豆，触发抓取后重试。';
    $.log('❌ ' + hint);
    $.msg('京东金融赚京豆', '❌ 参数缺失', hint);
    $.done();
    return;
  }

  let savedReq;
  try { savedReq = JSON.parse(reqRaw); } catch (e) { savedReq = null; }
  if (!savedReq || !savedReq.body) {
    $.log('❌ 请求参数格式错误，请重新打开 App 抓取');
    $.done();
    return;
  }

  // 参数时效提醒
  const ageDays = (Date.now() - reqTs) / 86400000;
  if (ageDays > 0.9) {
    $.log(`⚠️ 参数已 ${ageDays.toFixed(1)} 天未更新，可能过期。建议打开 App 刷新`);
  }

  const lines = [];
  lines.push(`📅 参数抓取于 ${new Date(reqTs).toLocaleString('zh-CN', { hour12: false })}`);

  // 1. 拉任务列表
  $.log('▶ 拉取任务列表');
  const list = await fetchTaskList(cookie, savedReq);
  if (list.risk) {
    lines.push('🚫 被风控拦截（' + (list.resp && list.resp.resultMsg) + '）');
    lines.push('➡️ 请打开京东金融 App 刷新参数后重试');
    finish(lines);
    return;
  }
  if (list.error === 'no_params') {
    lines.push('❌ 请求参数缺失');
    finish(lines);
    return;
  }
  if (list.coin) lines.push(`💰 当前京豆: ${list.coin}`);

  const allTasks = list.tasks;
  // 只处理可接取的（status=-1 未接取 + receivingStatus=1 可接取）
  const acceptable = allTasks.filter(t =>
    String(t.status) === '-1' &&
    (String(t.receivingStatus) === '1' || t.receivingStatus === 1)
  );
  const alreadyDone = allTasks.length - acceptable.length;
  $.log(`📋 任务总数 ${allTasks.length}，可接取 ${acceptable.length}，已接取/已完成 ${alreadyDone}`);

  if (!acceptable.length) {
    lines.push('✅ 没有可接取的任务');
    finish(lines);
    return;
  }

  // 列出可接取任务
  lines.push(`📋 可接取 ${acceptable.length} 项:`);
  acceptable.forEach(t => {
    const title = (t.title && t.title.text) || '未知任务';
    const award = (t.awardNumber && t.awardNumber.text) || '';
    lines.push(`  · ${title} ${award}`);
  });

  // 2. 逐个接取
  const riskParams = parseRiskParams(savedReq);
  if (!riskParams || !riskParams.signature) {
    lines.push('❌ 无法从请求参数解析风险签名，请重新打开 App 抓取');
    finish(lines);
    return;
  }

  let okCount = 0, failCount = 0;
  const failMsgs = [];
  for (let i = 0; i < acceptable.length; i++) {
    const task = acceptable[i];
    const title = (task.title && task.title.text) || task.missionId;
    if (i > 0) await sleep(REQUEST_INTERVAL); // 每个任务间隔，避免风控
    $.log(`▶ 接取 ${i + 1}/${acceptable.length}: ${title}`);
    const r = await receiveMission(cookie, task, riskParams);
    if (r.risk) {
      lines.push('🚫 接取时被风控拦截（' + (r.resp && r.resp.resultMsg) + '）');
      lines.push(`  ⏹ 已接取 ${okCount} 个后停手`);
      lines.push('➡️ 请打开京东金融 App 刷新参数，或降低频率');
      finish(lines);
      return;
    }
    if (r.ok) {
      okCount++;
      lines.push(`  ✅ ${title} 接取成功`);
    } else if (r.msg && r.msg.indexOf('已接取') !== -1) {
      // 已在别处接取过：不算失败
      okCount++;
      lines.push(`  ℹ️ ${title} 已接取过`);
    } else {
      failCount++;
      failMsgs.push(`${title}: ${r.msg || '失败'}`);
      lines.push(`  ⚠️ ${title}: ${r.msg || '失败'}`);
    }
    await sleep(LIST_REFRESH_DELAY);
  }

  // 3. 复查
  $.log('▶ 复查剩余任务');
  await sleep(LIST_REFRESH_DELAY);
  const list2 = await fetchTaskList(cookie, savedReq);
  if (list2.risk) {
    lines.push('🚫 复查被风控拦截');
    lines.push(`  ⏹ 已接取 ${okCount} 个`);
    finish(lines);
    return;
  }
  const remain = list2.tasks.length;
  lines.push(`🔎 复查: 剩余 ${remain} 项未接取`);
  if (remain) {
    list2.tasks.slice(0, 10).forEach(t => {
      const title = (t.title && t.title.text) || t.missionId;
      lines.push(`  · ${title}`);
    });
    if (remain > 10) lines.push(`  · ...等 ${remain} 项`);
  }
  lines.push(`\n📊 本次: 成功接取 ${okCount}，失败 ${failCount}`);

  finish(lines);
}

function finish(lines) {
  const summary = lines.join('\n');
  $.log(summary);
  $.msg('京东金融赚京豆', '✅ 完成', summary);
  $.done();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ================================================
// 抓取模式：rewrite script-request-body
// 打开京东金融 App → 我的 → 京豆 → 做任务赚京豆
// 页面发任务列表请求(11189)时触发，保存完整 body(含风控签名)+cookie
// ================================================
if (typeof $request !== 'undefined' && $request.url && /ms\.jr\.jd\.com/.test($request.url)) {
  const url = $request.url || '';
  const headers = ($request.headers) || {};
  const cookie = headers.Cookie || headers.cookie || '';
  const method = $request.method || 'POST';
  // script-request-body 才有 body；header 型 $request.body 为空，需兼容
  const body = $request.body || '';
  const isTaskList = /getPageInfoSafetyTranslate\?pageType=11189/.test(url) && /POST/i.test(method);

  if (cookie) setData(CK_KEY, cookie);

  if (isTaskList) {
    if (body) {
      // 保存完整 body + cookie + App 真实请求 headers（重放时原样使用，避免伪造头被网关识别）
      const capHeaders = {};
      Object.keys(headers).forEach(k => { capHeaders[k] = String(headers[k]); });
      setData(REQ_KEY, JSON.stringify({ body, cookie, headers: capHeaders, ts: Date.now() }));
      setData(REQ_TS_KEY, String(Date.now()));
      console.log('[JDJR] ✅ 已抓取任务列表请求参数（含风控签名 + 请求头），可注释抓取规则');
      if (typeof $notify !== 'undefined') {
        $notify('京东金融赚京豆', '✅ 参数已抓取', '任务列表请求参数已保存，可注释抓取规则');
      } else if (typeof $notification !== 'undefined' && $notification.post) {
        $notification.post('京东金融赚京豆', '✅ 参数已抓取', '任务列表请求参数已保存，可注释抓取规则');
      }
    } else {
      console.log('[JDJR] ⚠️ 任务列表请求触发，但 body 为空（使用了 script-request-header？请改用 script-request-body）');
    }
  } else if (cookie) {
    console.log('[JDJR] Cookie 已更新');
  }
  if (typeof $done !== 'undefined') $done({});
} else {
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
      if (typeof $notify !== 'undefined') $notify(title, subtitle, body);
      else if (typeof $notification !== 'undefined' && $notification.post) $notification.post(title, subtitle, body);
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
