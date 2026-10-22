// 验证 jd_bean_expire_qx.js (精确+逐日明细版): 模拟 QX 环境 + HAR 实录响应结构
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'jd_bean_expire_qx.js'), 'utf8');

const CK_A = 'pt_key=KA;pt_pin=jd_testA;';   // 正常: 有过期豆 + 逐日明细
const CK_B = 'pt_key=KB;pt_pin=jd_testB;';   // 正常: 无过期
const CK_C = 'pt_key=KC;pt_pin=jd_testC;';   // cookie 失效

const DETAIL_HTML = '<html><script>window.__data={"expireTransactions":['
  + '{"title":null,"num":21,"transactionTime":"2026-11-12 23:59:59"},'
  + '{"title":null,"num":40,"transactionTime":"2026-11-13 23:59:59"},'
  + '{"title":null,"num":0,"transactionTime":"2026-11-14 23:59:59"},'
  + '{"title":null,"num":255,"transactionTime":"2026-11-19 23:59:59"}'
  + ']};</script></html>';   // 含 num=0 的脏数据, 应被过滤; 合计 316

let notifyCalls = [];
let barkCalls = [];
const sandbox = {
  console,
  Date, JSON, Math, String, Number, Array, Object, Promise, Error, Map, Set, RegExp, Boolean,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN,
  setTimeout: (fn, ms) => { fn(); return 0; }, clearTimeout: () => {},
  $prefs: {
    valueForKey: k => {
      if (k === 'CookiesJD') return JSON.stringify([{ cookie: CK_A }, { cookie: CK_B }, { cookie: CK_C }]);
      if (k === 'JD_BARK_URL') return process.env.TEST_BARK === 'off' ? '' : 'https://api.day.app/TESTKEY';
      return '';
    },
    setValueForKey: () => {},
  },
  $notify: (t, s, b) => { notifyCalls.push({ t, s, b }); },
  $done: () => {},
  $task: {
    fetch: o => {
      const url = o.url || '';
      if (/api\.day\.app/.test(url)) {
        barkCalls.push({ url, body: JSON.parse(o.body) });
        return Promise.resolve({ statusCode: 200, body: '{"code":200,"message":"success"}' });
      }
      const pin = (o.headers.Cookie || '').match(/pt_pin=([^;]+)/)[1];
      if (url.includes('bff_rightsCenter_userInfo')) {
        if (pin === 'jd_testA') return Promise.resolve({ statusCode: 200, body: JSON.stringify({ code: '1711000', rs: { expireBeans: 316, expireDays: 30, jingBeanValue: '24.15', jingBeans: '2415' } }) });
        if (pin === 'jd_testB') return Promise.resolve({ statusCode: 200, body: JSON.stringify({ code: '1711000', rs: { expireBeans: 0, expireDays: 30, jingBeanValue: '5.00', jingBeans: '500' } }) });
        return Promise.resolve({ statusCode: 200, body: JSON.stringify({ code: 'F10002', msg: '用户未登陆' }) });
      }
      if (url.includes('489nMDh5uCXJqx5B3VbQTKTz5bpr')) {
        if (pin === 'jd_testA') return Promise.resolve({ statusCode: 200, body: DETAIL_HTML });
        return Promise.resolve({ statusCode: 200, body: '<html>无数据</html>' });
      }
      return Promise.resolve({ statusCode: 404, body: '' });
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

setTimeout(() => {
  const msg = notifyCalls[0] ? notifyCalls[0].b : '';
  console.log('===== 通知内容 =====');
  console.log(msg);
  console.log('===== 断言 =====');
  const ok = [];
  ok.push(['通知已发出', notifyCalls.length === 1]);
  ok.push(['A: 余额+过期总数', /jd_testA: 余额 2415 豆\(¥24\.15\)，30 天内过期 316 豆/.test(msg)]);
  ok.push(['A: 逐日明细 11-12 过期 21 豆', /11-12 过期 21 豆/.test(msg)]);
  ok.push(['A: num=0 脏数据被过滤(无 11-14)', !/11-14/.test(msg)]);
  ok.push(['A: 明细合计 316 无出入提示', !/有出入/.test(msg)]);
  ok.push(['B: 30 天内无过期', /jd_testB: 余额 500 豆\(¥5\.00\)，30 天内无过期/.test(msg)]);
  ok.push(['C: cookie 失效提示 CK检测', /jd_testC: cookie失效.*CK检测/s.test(msg)]);
  ok.push(['数据来源说明', /权益中心/.test(msg)]);
  // Bark 推送 (TEST_BARK=off 场景验证"未配置则跳过", 默认场景验证"配置则推送")
  if (process.env.TEST_BARK === 'off') {
    ok.push(['Bark: 未配置则不推送', barkCalls.length === 0]);
  } else {
    ok.push(['Bark: 推送1次到配置URL', barkCalls.length === 1 && barkCalls[0].url === 'https://api.day.app/TESTKEY']);
    ok.push(['Bark: POST JSON 含 title/body/group', barkCalls.length === 1 && barkCalls[0].body.title === '京豆过期统计' && /jd_testA/.test(barkCalls[0].body.body) && barkCalls[0].body.group === 'JDBeanExpire']);
    ok.push(['Bark: isArchive=1 必须带上(否则历史不保存)', barkCalls.length === 1 && barkCalls[0].body.isArchive === '1']);
  }
  let pass = true;
  for (const [name, v] of ok) { console.log((v ? '✔' : '✘'), name); if (!v) pass = false; }
  process.exit(pass ? 0 : 1);
}, 300);
