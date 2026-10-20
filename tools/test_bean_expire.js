// 验证 jd_bean_expire_qx.js 的统计逻辑 (模拟 QX 环境 + 合成数据)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'jd_bean_expire_qx.js'), 'utf8');

// ---- 合成数据: 2个账号, 收入跨2年, 支出部分扣减 ----
function detail(date, amount, event) { return { date, amount, eventMassage: event }; }
const acc1 = [
  // 2025年(今年12/31过期)收入 500
  detail('2025-03-01 10:00:00', 100, '签到奖励'),
  detail('2025-05-01 10:00:00', 150, '浏览任务'),
  detail('2025-08-01 10:00:00', 250, '种豆得豆'),
  // 2025年支出 200 (FIFO 扣最早的批次)
  detail('2025-06-01 10:00:00', -200, '购物抵扣'),
  // 2026年(明年12/31过期)收入 300
  detail('2026-01-15 10:00:00', 180, '签到奖励'),
  detail('2026-09-01 10:00:00', 120, '浏览任务'),
  // 2026年支出 100
  detail('2026-09-20 10:00:00', -100, '购物抵扣'),
]; // 期望: FIFO后 2025批剩 500-200=300 → 2026-12-31过期300豆; 2026批 300-100=200 → 2027-12-31过期200豆
const acc2 = [detail('2025-02-01 10:00:00', 50, '签到奖励')]; // 无支出 → 50豆今年过期

let notifyCalls = [];
const sandbox = {
  console,
  Date, JSON, Math, String, Number, Array, Object, Promise, Error, Map, Set, RegExp, Boolean,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN,
  setTimeout: (fn, ms) => { fn(); return 0; }, clearTimeout: () => {},
  $prefs: {
    valueForKey: k => {
      if (k === 'CookiesJD') return JSON.stringify([{ cookie: 'pt_key=K1;pt_pin=jd_testA;' }]);
      if (k === 'CookieJD') return 'pt_key=K2;pt_pin=jd_testB;';
      return '';
    },
    setValueForKey: () => {},
  },
  $notify: (t, s, b) => { notifyCalls.push({ t, s, b }); },
  $done: () => {},
  $task: {
    fetch: o => {
      const page = JSON.parse(decodeURIComponent(o.body.match(/body=([^&]+)/)[1])).page;
      const data = page === '1' ? acc2 : [];   // 账号B只有1页; 账号A... 按顺序: A先跑(2个cookie去重后顺序: CookiesJD先)
      return Promise.resolve({ statusCode: 200, body: JSON.stringify({ code: '0', detailList: page === '1' ? acc1 : (page === '2' ? acc2 : []) }) });
    },
  },
};
// 修正: 两个账号 -> A拉page1..n直到cutoff; B拉page1
let callIdx = 0;
sandbox.$task.fetch = o => {
  const page = JSON.parse(decodeURIComponent(o.body.match(/body=([^&]+)/)[1])).page;
  let list = [];
  if (callIdx === 0) { list = acc1; callIdx++; }       // A page1
  else if (callIdx === 1) { list = []; callIdx++; }    // A page2 (空)
  else if (callIdx === 2) { list = []; callIdx++; }    // A page3 (空, miss>=2 停)
  else if (callIdx === 3) { list = acc2; callIdx++; }  // B page1
  else list = [];
  return Promise.resolve({ statusCode: 200, body: JSON.stringify({ code: '0', detailList: list }) });
};

vm.createContext(sandbox);
vm.runInContext(src, sandbox);

// ---- 断言 ----
setTimeout(() => {
  const ok = [];
  const msg = notifyCalls[0] ? notifyCalls[0].b : '';
  console.log('===== 通知内容 =====');
  console.log(msg);
  console.log('===== 断言 =====');
  // FIFO 正确行为: 支出300按批次顺序扣 -> 签到100全扣, 浏览150全扣, 种豆250扣50剩200
  ok.push(['通知已发出', notifyCalls.length === 1]);
  ok.push(['账号A 2026-12-31 过期 200 豆 (种豆批剩200)', /2026-12-31 前过期: 200 豆/.test(msg) && /种豆得豆: 200豆/.test(msg)]);
  ok.push(['账号A 2027-12-31 过期 300 豆 (2026年新批)', /2027-12-31 前过期: 300 豆/.test(msg)]);
  ok.push(['账号A FIFO 现存 500 豆', /推算现存: 约 500 豆/.test(msg)]);
  ok.push(['账号B 2026-12-31 过期 50 豆', /2026-12-31 前过期: 50 豆/.test(msg)]);
  ok.push(['A 账号1 pin 显示', /jd_testA/.test(msg)]);
  ok.push(['B 账号2 pin 显示', /jd_testB/.test(msg)]);
  ok.push(['含活动豆提醒', /活动豆/.test(msg)]);
  let pass = true;
  for (const [name, v] of ok) { console.log((v ? '✔' : '✘'), name); if (!v) pass = false; }
  process.exit(pass ? 0 : 1);
}, 500);
