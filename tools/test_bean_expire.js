// 验证 jd_bean_expire_qx.js 精确查询版 (模拟 QX 环境 + bff 响应)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'jd_bean_expire_qx.js'), 'utf8');

// 模拟 3 个账号: A 正常有过期豆, B 正常无过期, C cookie 失效
const CK_A = 'pt_key=KA;pt_pin=jd_testA;';
const CK_B = 'pt_key=KB;pt_pin=jd_testB;';
const CK_C = 'pt_key=KC;pt_pin=jd_testC;';

let notifyCalls = [];
const sandbox = {
  console,
  Date, JSON, Math, String, Number, Array, Object, Promise, Error, Map, Set, RegExp, Boolean,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN,
  setTimeout: (fn, ms) => { fn(); return 0; }, clearTimeout: () => {},
  $prefs: {
    valueForKey: k => {
      if (k === 'CookiesJD') return JSON.stringify([{ cookie: CK_A }, { cookie: CK_B }, { cookie: CK_C }]);
      return '';
    },
    setValueForKey: () => {},
  },
  $notify: (t, s, b) => { notifyCalls.push({ t, s, b }); },
  $done: () => {},
  $task: {
    fetch: o => {
      const ck = o.headers.Cookie;
      const pin = ck.match(/pt_pin=([^;]+)/)[1];
      let resp;
      if (pin === 'jd_testA') resp = { statusCode: 200, body: JSON.stringify({ code: '1711000', msg: '成功', rs: { expireBeans: 316, expireDays: 30, jingBeanValue: '24.15', jingBeans: '2415' } }) };
      else if (pin === 'jd_testB') resp = { statusCode: 200, body: JSON.stringify({ code: '1711000', msg: '成功', rs: { expireBeans: 0, expireDays: 30, jingBeanValue: '5.00', jingBeans: '500' } }) };
      else resp = { statusCode: 200, body: JSON.stringify({ code: 'F10002', msg: '用户未登陆' }) };
      return Promise.resolve(resp);
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
  ok.push(['A: 显示余额2415+30天过期316', /jd_testA: 余额 2415 豆\(¥24\.15\)，30 天内过期 316 豆/.test(msg)]);
  ok.push(['A: 提示先花它', /先花它/.test(msg)]);
  ok.push(['B: 显示30天内无过期', /jd_testB: 余额 500 豆\(¥5\.00\)，30 天内无过期/.test(msg)]);
  ok.push(['C: 提示cookie失效+CK检测', /jd_testC: cookie失效.*CK检测/s.test(msg)]);
  ok.push(['含数据来源说明', /权益中心/.test(msg)]);
  let pass = true;
  for (const [name, v] of ok) { console.log((v ? '✔' : '✘'), name); if (!v) pass = false; }
  process.exit(pass ? 0 : 1);
}, 300);
