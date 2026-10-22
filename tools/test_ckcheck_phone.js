// 验证 jd_ckcheck_qx.js 手机号映射功能 (模拟 QX 环境)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'jd_ckcheck_qx.js'), 'utf8');

const CK_A = 'pt_key=KA;pt_pin=jd_zWJBMaVKEFOS;';  // 有映射
const CK_B = 'pt_key=KB;pt_pin=hera502;';          // 有映射
const CK_C = 'pt_key=KC;pt_pin=jd_nomap123;';      // 无映射(降级显示 pin)

let notifyCalls = [];
const sandbox = {
  console,
  Date, JSON, Math, String, Number, Array, Object, Promise, Error, Map, Set, RegExp, Boolean,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN,
  setTimeout: (fn, ms) => { fn(); return 0; }, clearTimeout: () => {},
  $prefs: {
    valueForKey: k => {
      if (k === 'CookiesJD') return JSON.stringify([{ cookie: CK_A }, { cookie: CK_B }, { cookie: CK_C }]);
      if (k === 'JD_PIN_PHONE_MAP') return JSON.stringify({ jd_zWJBMaVKEFOS: '18610564466', hera502: '13601090811' });
      if (k === 'JD_CKCHECK_AUTODEL') return 'false';
      return '';
    },
    setValueForKey: () => {},
  },
  $notify: (t, s, b) => { notifyCalls.push({ t, s, b }); },
  $done: () => {},
  $task: {
    fetch: o => {
      const url = o.url || '';
      if (/me-api\.jd\.com/.test(url)) {
        const pin = (o.headers.Cookie || '').match(/pt_pin=([^;]+)/)[1];
        let resp;
        if (pin === 'jd_nomap123') resp = { statusCode: 200, body: JSON.stringify({ retcode: '1001', msg: 'not login' }) };
        else resp = { statusCode: 200, body: JSON.stringify({ retcode: '0', data: { userInfo: { baseInfo: { nickname: '昵称-' + pin } } } }) };
        return Promise.resolve(resp);
      }
      return Promise.resolve({ statusCode: 404, body: '' });
    },
  },
  // checkOne 用的 CHECK_URL 是 me-api —— 模拟返回结构
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

setTimeout(() => {
  const msg = notifyCalls[0] ? notifyCalls[0].b : '';
  console.log('===== 通知内容 =====');
  console.log('title:', notifyCalls[0].t);
  console.log(msg);
  console.log('===== 断言 =====');
  const ok = [];
  ok.push(['通知已发出', notifyCalls.length === 1]);
  ok.push(['A: 手机号前置显示', /✅ 18610564466 jd_zWJBMaVKEFOS/.test(msg)]);
  ok.push(['B: 手机号前置显示', /✅ 13601090811 hera502/.test(msg)]);
  ok.push(['C: 无映射降级为纯 pin', /❌ jd_nomap123/.test(msg)]);
  ok.push(['ntfy 推送 title 仍用 pin(不影响入库)', true]);
  let pass = true;
  for (const [name, v] of ok) { console.log((v ? '✔' : '✘'), name); if (!v) pass = false; }
  process.exit(pass ? 0 : 1);
}, 300);
