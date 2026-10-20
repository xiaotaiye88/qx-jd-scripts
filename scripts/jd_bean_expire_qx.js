/*
 * 京豆过期统计（Quantumult X 原生版）
 * cron: 23 10 1 12 *   （每年12月1日 + 可随时手动跑）
 *
 * 背景:
 *   京东的过期查询接口 queryexpirejingdou 已下线(任何 cookie 都返回空), 精确有效期查不到。
 *   但有效期规则固定: 常规京豆有效期至"获得次年的12月31日"。
 *   因此拉取收支明细 -> 按获得时间分批 -> FIFO 扣减支出 -> 推算每批剩余的过期时间。
 *
 * 行为:
 *   1. 读取 BoxJs 的 CookiesJD / CookieJD / CookieJD2（多账号）
 *   2. 逐账号翻页拉取京豆收支明细（覆盖近两年, 约1-3分钟）
 *   3. FIFO 推算: 按过期年份分组统计剩余豆数
 *   4. 通知推送结果
 *
 * 注意: 活动发放的京豆(180天有效期)会比推算值更早过期, 明细无法区分类型,
 *       结果为"最晚过期时间", 保守起见每年12月初清一次豆即可。
 */

const TIMEOUT = 20000;
const PAGE_SIZE = 20;
const MAX_PAGE = 600;
const PAGE_WAIT_MS = 350;
// 明细拉取窗口: 覆盖"去年1月1日至今"(去年的豆今年12/31过期, 是统计重点; 更早的批次已扣完无需拉)
const CUTOFF = new Date(new Date().getFullYear() - 1, 0, 1).getTime();
const UA = 'jdapp;iPhone;11.0.4;15.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

function readPref(key) {
  try { return $prefs.valueForKey(key) || ''; } catch (e) { return ''; }
}
function pinFragment(ck) {
  const m = (ck || '').match(/pt_pin=[^;]+;?/);
  return m ? m[0] : '';
}
function collectCookies() {
  const out = [];
  const seen = new Set();
  const push = (ck) => {
    if (!ck || typeof ck !== 'string') return;
    const pf = pinFragment(ck);
    const k = pf || ck;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ cookie: ck.trim(), pin: pf });
  };
  try { JSON.parse(readPref('CookiesJD') || '[]').forEach(it => push(it.cookie)); } catch (e) {}
  push(readPref('CookieJD'));
  push(readPref('CookieJD2'));
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchDetailPage(ck, page) {
  return new Promise(resolve => {
    $task.fetch({
      url: 'https://api.m.jd.com/client.action?functionId=getJingBeanBalanceDetail',
      method: 'POST',
      headers: {
        'Cookie': ck,
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://bean.m.jd.com/beanDetail/index.action?resourceValue=bean',
        'Accept': '*/*',
      },
      body: 'body=' + encodeURIComponent(JSON.stringify({ pageSize: String(PAGE_SIZE), page: String(page) })) + '&appid=ld',
      timeout: TIMEOUT,
    }).then(resp => {
      try {
        if (resp.statusCode !== 200) { resolve({ err: 'HTTP ' + resp.statusCode }); return; }
        const j = JSON.parse(resp.body || '');
        if (j.code !== '0') { resolve({ err: 'code=' + j.code }); return; }
        resolve({ list: j.detailList || [] });
      } catch (e) { resolve({ err: '解析失败: ' + e.message }); }
    }, err => resolve({ err: '网络错误: ' + (err && err.message || err) }));
  });
}

async function pullDetail(ck, log) {
  const all = [];
  let page = 1, miss = 0;
  while (page <= MAX_PAGE) {
    const r = await fetchDetailPage(ck, page);
    if (r.err) return { err: r.err };
    if (!r.list.length) { if (++miss >= 2) break; page++; continue; }
    let stop = false;
    for (const it of r.list) {
      const t = new Date(String(it.date).replace(/-/g, '/') + '+08:00').getTime();
      if (t < CUTOFF) stop = true;
      all.push(it);
    }
    if (stop) break;
    page++;
    if (page % 20 === 0) log(`  已拉 ${page} 页 / ${all.length} 条...`);
    await sleep(PAGE_WAIT_MS);
  }
  return { list: all };
}

// FIFO 推算: 支出按获得先后抵扣(≈先过期先消耗), 剩余批次按"次年12月31日"过期
function expireStats(list) {
  const income = [], expense = [];
  for (const it of list) {
    const amt = parseInt(it.amount, 10) || 0;
    const t = new Date(String(it.date).replace(/-/g, '/') + '+08:00');
    if (amt > 0) income.push({ t, amt, event: String(it.eventMassage || it.event || '未知').trim() });
    else if (amt < 0) expense.push({ t, amt: -amt });
  }
  income.sort((a, b) => a.t - b.t);
  expense.sort((a, b) => a.t - b.t);
  const batches = income.map(r => ({ ...r, remain: r.amt, expYear: r.t.getFullYear() + 1 }));
  for (const e of expense) {
    let need = e.amt;
    for (const b of batches) {
      if (need <= 0) break;
      if (b.remain <= 0) continue;
      const use = Math.min(b.remain, need);
      b.remain -= use; need -= use;
    }
  }
  const byYear = new Map();
  for (const b of batches) {
    if (b.remain <= 0) continue;
    if (!byYear.has(b.expYear)) byYear.set(b.expYear, { total: 0, events: new Map() });
    const g = byYear.get(b.expYear);
    g.total += b.remain;
    g.events.set(b.event, (g.events.get(b.event) || 0) + b.remain);
  }
  return {
    incomeSum: income.reduce((s, r) => s + r.amt, 0),
    expenseSum: expense.reduce((s, r) => s + r.amt, 0),
    remain: batches.reduce((s, b) => s + b.remain, 0),
    earliest: income.length ? income[0].t : null,
    byYear,
  };
}

function fmtDate(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

(async () => {
  const accounts = collectCookies();
  if (!accounts.length) {
    $notify('京豆过期统计', '❌ 未找到 Cookie', '请先在 BoxJs 配置 CookiesJD');
    $done();
    return;
  }
  console.log('京豆过期统计: 共 ' + accounts.length + ' 个账号, 明细窗口截止 ' + fmtDate(CUTOFF));
  let allMsg = '';
  for (const acc of accounts) {
    const pin = (acc.pin.match(/pt_pin=([^;]+);?/) || [])[1] || '账号';
    const log = s => console.log('[' + decodeURIComponent(pin) + '] ' + s);
    log('开始拉取明细...');
    const r = await pullDetail(acc.cookie, log);
    if (r.err) {
      log('❌ ' + r.err);
      allMsg += `【${decodeURIComponent(pin)}】拉取失败: ${r.err}\n`;
      continue;
    }
    if (!r.list.length) {
      allMsg += `【${decodeURIComponent(pin)}】无明细数据\n`;
      continue;
    }
    const st = expireStats(r.list);
    log(`明细 ${r.list.length} 条 (${fmtDate(st.earliest)} ~ 今), 收入${st.incomeSum}/支出${st.expenseSum}, FIFO现存${st.remain}`);
    let msg = `【${decodeURIComponent(pin)}】\n`;
    msg += `明细窗口: ${fmtDate(st.earliest)} 起, 收入 ${st.incomeSum} / 支出 ${st.expenseSum} 豆\n`;
    msg += `推算现存: 约 ${st.remain} 豆 (以App余额为准)\n`;
    const years = [...st.byYear.keys()].sort();
    for (const y of years) {
      const g = st.byYear.get(y);
      const days = Math.round((new Date(y, 11, 31) - Date.now()) / 86400000);
      msg += `⏰ ${y}-12-31 前过期: ${g.total} 豆 (还有${days}天)\n`;
      [...g.events.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        .forEach(([e, v]) => { msg += `   ${e}: ${v}豆\n`; });
    }
    allMsg += msg + '\n';
  }
  if (allMsg) {
    allMsg += '⚠️ 活动豆(180天效期)可能更早过期; 建议每年12月初清豆';
    console.log('\n' + allMsg);
    $notify('京豆过期统计', accounts.length + ' 个账号', allMsg);
  }
  $done();
})();
