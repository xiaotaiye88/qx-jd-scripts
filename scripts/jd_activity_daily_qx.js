/*
 * 京豆活动合集（圈X 原生版）
 * 覆盖以下活动，每个独立 try/catch，单点失败不影响其它：
 *   1. 奇遇盒每日抽奖      superRedBagHome + superRedBagDraw   （实测被网关风控 403，仅尝试不报错）
 *   2. 东东农场任务领奖    apTaskList + apTaskDrawAward         （实测可用）
 *   3. 天降福利浏览得京豆  apStartTaskTime → apDoTask → drawPrize（实测可用，已领到京豆）
 *   4. 服饰美妆频道签到    jxzy_active_querySign                 （实测返回 147 活动太火爆）
 *
 * 全部走 api.m.jd.com/api，实测无需 h5st（缺 h5st 也能调通）。
 * 只做「领已达成奖励」和「浏览类任务」，不碰下单/助力/跨 App 任务。
 *
 * cron: 8 9,20 * * *
 *
 * BoxJs 键：沿用 CookiesJD / CookieJD / CookieJD2（与其它脚本一致）
 */

const LINK_QIYU = 'iUvGsiAt2wa037ISxyF-PA';      // 奇遇盒
const LINK_FARM = 'fWWo3YmB983abNOJPR7veg';      // 东东农场任务
const LINK_TIANJIANG = 'scp32gzb8n5pl76d4r2ak';  // 天降福利
const LINK_JXZY = 'jgwurvXVswT7VFuX4S5DG2aaK1T'; // 服饰美妆频道

const ACT_FARM = '42HV4J3Q87B2xFQMJk81PCc1mEs3';
const UA = 'jdapp;iPhone;16.1.50;;;M/5.0;appBuild/171135;jdSupportDarkMode/1;lang/zh_CN;ctype/0;site/CN;ccy/CNY;';

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

// ---------- 通用请求 ----------
function api(fid, body, opts) {
  opts = opts || {};
  const params = {
    functionId: fid,
    body: JSON.stringify(body),
    appid: opts.appid || 'activities_platform',
    client: 'apple',
    clientVersion: '16.1.50',
    t: String(Date.now()),
    loginType: '2',
    loginWQBiz: 'wegame',
    platform: '3',
  };
  if (opts.businessId) params.businessId = opts.businessId;
  const qs = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  return new Promise(resolve => {
    $task.fetch({
      url: 'https://api.m.jd.com/api',
      method: 'POST',
      headers: {
        'Cookie': opts.cookie,
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json, text/plain, */*',
        'Referer': opts.referer || ('https://pro.m.jd.com/mall/active/' + ACT_FARM + '/index.html'),
      },
      body: qs,
    }).then(resp => {
      let j = null;
      try { j = JSON.parse(resp.body); } catch (e) { /* 非 JSON */ }
      resolve({ status: resp.statusCode, raw: resp.body, json: j });
    }, err => resolve({ status: 0, raw: String((err && err.error) || err), json: null }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// interact_act_invoke 把业务结果包在 data 里；注意外层也有 code。
// loadAct: { data: { code: 0, data: { taskDetail } } }
// apStartTaskTime: { data: { code: 0, data: { jumpUrl } } }   ← code 在外层 data
function unwrapInteract(r) {
  if (!r.json) return null;
  return (r.json.data && r.json.data.data !== undefined) ? r.json.data.data : null;
}
function interactCode(r) {
  if (!r.json || !r.json.data) return null;
  return r.json.data.code !== undefined ? r.json.data.code : null;
}
function interactErr(r) {
  if (!r.json) return 'HTTP ' + r.status;
  if (r.json.data && r.json.data.errMsg) return r.json.data.errMsg;
  return 'HTTP ' + r.status;
}

// ---------- 1) 奇遇盒每日抽奖 ----------
// 实测：superRedBagHome 可查（返回剩余次数），superRedBagDraw 固定 403（网关级风控）。
// 保留实现是为了风控解除后自动生效，失败只记一行日志，不重试不打扰。
async function doQiyu(ck, log) {
  const ref = 'https://pro.m.jd.com/mall/active/' + LINK_QIYU + '/index.html';
  const home = await api('superRedBagHome',
    { envType: 1, linkId: LINK_QIYU, initFlag: 1, dailyLotteryFlag: 1 },
    { cookie: ck, businessId: '5be1b', referer: ref });
  const d = (home.json && home.json.data) || {};
  const dly = d.dailyLotteryVo || {};
  let left = dly.dailyLeftLotteryTimes;
  if (left === undefined || left === null) left = dly.leftLotteryTimes;
  if (left === undefined || left === null) left = d.leftLotteryTimes;
  left = Number(left || 0);
  if (!left) {
    log.push('🎁 奇遇盒: 今日无抽奖次数');
    return;
  }
  const r = await api('superRedBagDraw', { envType: 1, linkId: LINK_QIYU },
    { cookie: ck, businessId: '89cfe', referer: ref });
  if (r.json && r.json.code === 0) {
    log.push('🎁 奇遇盒: 抽奖成功（剩余 ' + left + ' 次）');
  } else if (r.status === 403) {
    log.push('🎁 奇遇盒: 剩 ' + left + ' 次待抽，接口被风控(403)，需手动去 App 抽');
  } else {
    log.push('🎁 奇遇盒: 剩 ' + left + ' 次，抽奖返回 ' + ((r.json && (r.json.errMsg || r.json.code)) || r.status));
  }
}

// ---------- 2) 东东农场任务领奖 ----------
async function doFarm(ck, log) {
  const r = await api('apTaskList',
    { linkId: LINK_FARM, queryType: 0, channel: 4, area: '1_2800_55825_0' },
    { cookie: ck });
  if (!r.json || r.json.code !== 0) {
    log.push('🌱 农场: 任务列表获取失败(' + r.status + ')');
    return;
  }
  const tasks = r.json.data || [];

  // 先做「关注频道」类任务：它不需要真的浏览 10s，apDoTask 直接判定完成。
  // 实测 apsDoTask / apStartTaskTime 被网关 403，但 apDoTask 是通的（无 h5st 也可）。
  // 纯浏览类（BROWSE_*）返回 2018 没达到做任务条件，跳过别浪费请求。
  const followTodo = tasks.filter(t => t.taskType === 'FOLLOW_CHANNEL'
    && !t.taskFinished && (t.taskLimitTimes || 0) > (t.taskDoTimes || 0));
  const followOk = [];
  for (const t of followTodo) {
    const pe = Object.assign({}, t.pipeExt || {}, { taskType: t.taskType });
    const r2 = await api('apDoTask', {
      taskType: t.taskType,
      taskId: -9999,
      channel: 4,
      checkVersion: true,
      linkId: LINK_FARM,
      pipeExt: pe,
      taskInsert: false,
      itemId: 'https://pro.m.jd.com/mall/active/' + LINK_JXZY
        + '/index.html?babelChannel=ttt5&mTabId=' + LINK_JXZY + '&useFoldTab=1',
    }, { cookie: ck });
    if (r2.json && r2.json.code === 0) followOk.push(t.taskShowTitle || t.taskType);
    await sleep(800);
  }
  if (followOk.length) log.push('🌱 农场: 完成 ' + followOk.join('、'));

  // 做完的任务奖励不会自动到账，重新拉一次列表再领
  const rFresh = followOk.length ? await api('apTaskList',
    { linkId: LINK_FARM, queryType: 0, channel: 4, area: '1_2800_55825_0' }, { cookie: ck }) : r;
  const claimable = ((rFresh.json && rFresh.json.data) || tasks)
    .filter(t => Number(t.canDrawAwardNum || 0) > 0);
  if (!claimable.length) {
    const doneCount = tasks.filter(t => t.taskFinished).length;
    log.push('🌱 农场: ' + tasks.length + ' 个任务，暂无可领奖励（' + doneCount + ' 个已完成）');
    return;
  }
  let ok = 0;
  const got = [];
  for (const t of claimable) {
    const pe = Object.assign({}, t.pipeExt || {});
    if (t.taskType === 'SUBSCRIBE' && !pe.itemId) pe.itemId = 'dongFarm';
    const r2 = await api('apTaskDrawAward', {
      taskType: pe.taskType || t.taskType,
      taskId: t.id,
      channel: 4,
      checkVersion: true,
      linkId: LINK_FARM,
      pipeExt: pe,
    }, { cookie: ck });
    if (r2.json && r2.json.code === 0) {
      ok++;
      const awards = (r2.json.data || [])
        .map(a => a.awardGivenNumber + (a.interactiveAwardName || a.awardName || ''))
        .join(',');
      got.push((t.taskShowTitle || t.taskType) + (awards ? '(' + awards + ')' : ''));
    }
    await sleep(1200);
  }
  log.push('🌱 农场: 可领 ' + claimable.length + ' 项，成功 ' + ok + ' 项'
    + (got.length ? ': ' + got.join('、') : ''));
}

// ---------- 3) 天降福利（浏览得京豆）----------
// 实测链路（全部走 interact_act_invoke，裸 ap* 接口会 403 或 no access）：
//   loadAct 取任务 → actFlowCode=apStartTaskTime 开始计时 →
//   等 timeLimitPeriod 秒 → actFlowCode=apDoTask 提交 → actFlowCode=drawPrize 领奖
async function doTianjiang(ck, log) {
  const ref = 'https://pro.m.jd.com/mall/active/' + LINK_TIANJIANG + '/index.html';
  const opts = { cookie: ck, appid: 'suprise_task', referer: ref };
  const invoke = (flow, extra) => api('interact_act_invoke',
    Object.assign({ envType: 1, linkId: LINK_TIANJIANG, actFlowCode: flow }, extra || {}), opts);

  const loaded = unwrapInteract(await invoke('loadAct'));
  const td = loaded && loaded.taskDetail;
  if (!td) {
    log.push('💰 天降福利: 活动未开放或结构变更');
    return;
  }
  const item = (td.taskItemList || [])[0] || {};
  const base = {
    taskId: td.id,
    taskType: td.taskType,
    pipeExt: td.pipeExt,
    itemId: item.itemId,
    itemType: item.itemType,
  };

  const start = await invoke('apStartTaskTime', base);
  if (interactCode(start) !== 0) {
    log.push('💰 天降福利: 开始计时失败(' + interactErr(start) + ')');
    return;
  }

  const waitSec = Number(td.timeLimitPeriod || 10) + 3;
  await sleep(waitSec * 1000);

  const done = await invoke('apDoTask', base);
  if (interactCode(done) !== 0) {
    log.push('💰 天降福利: 任务未达成(' + interactErr(done) + ')');
    return;
  }

  const prize = unwrapInteract(await invoke('drawPrize'));
  if (prize && prize.sendResult) {
    log.push('💰 天降福利: 领到 ' + prize.amount + ' ' + (prize.prizeDesc || '京豆'));
  } else if (prize && prize.code === 0) {
    log.push('💰 天降福利: 任务完成，奖励已提交（今日可能已领）');
  } else {
    log.push('💰 天降福利: ' + ((prize && (prize.errMsg || prize.code)) || '无可用奖励'));
  }
}

// ---------- 4) 服饰美妆频道签到 ----------
// 实测：该接口要求 body 里带 craftId + signStr + tttId + uuid 等页面侧签名
// （signStr 由频道页 JS 生成），脚本侧无法构造；且真实页面调用本身就返回 3004「活动太火爆」。
// 结论：不可脚本化，只在日志里提示手动签到，不浪费请求。
function doJxzy(ck, log) {
  log.push('👗 服饰美妆: 该签到需页面侧 signStr 签名，脚本无法构造，请手动进频道页签到');
}

// ---------- 主流程 ----------
!(async () => {
  const cookies = readCookies();
  if (!cookies.length) {
    console.log('未找到京东 Cookie，请先在 BoxJs 配置 CookiesJD / CookieJD');
    if (typeof $done !== 'undefined') $done();
    return;
  }
  const allLogs = [];
  for (let i = 0; i < cookies.length; i++) {
    const ck = cookies[i];
    const logs = [];
    try { await doQiyu(ck, logs); } catch (e) { logs.push('🎁 奇遇盒异常: ' + e.message); }
    try { await doFarm(ck, logs); } catch (e) { logs.push('🌱 农场异常: ' + e.message); }
    try { await doTianjiang(ck, logs); } catch (e) { logs.push('💰 天降福利异常: ' + e.message); }
    try { await doJxzy(ck, logs); } catch (e) { logs.push('👗 服饰美妆异常: ' + e.message); }
    const head = '【' + (i + 1) + '】' + pinOf(ck);
    console.log(head + '\n' + logs.join('\n'));
    allLogs.push(head + '\n' + logs.join('\n'));
  }
  const body = allLogs.join('\n\n');
  if (typeof $notify !== 'undefined') $notify('京豆活动合集', '', body);
  if (typeof $done !== 'undefined') $done();
})();
