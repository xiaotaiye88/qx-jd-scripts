// 在 vm 中运行 jd_bean_info.js (明文源码, QX 分支), patch 翻页拉全量京豆明细
// 用法: node run_bean_info_full.js "pt_key=...;pt_pin=...;"
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const COOKIE = process.argv[2];
if (!COOKIE) { console.error('用法: node run_bean_info_full.js "pt_key=...;pt_pin=...;"'); process.exit(1); }

const UA = 'jdapp;iPhone;9.4.4;14.3;network/4g;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1';

// 真实转发 $task.fetch (gzip 自动解压, 类 QX 行为)
function taskFetch(o) {
  return new Promise((resolve, reject) => {
    const u = new URL(o.url);
    const headers = { ...(o.headers || {}) };
    // 补缺失的 UA (脚本 QX 分支 $.UA 为 undefined)
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    if (!headers['User-Agent']) headers['User-Agent'] = UA;
    if (o.body) headers['Content-Length'] = Buffer.byteLength(String(o.body));
    headers['Accept-Encoding'] = 'gzip, deflate';
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: (o.method || 'GET').toUpperCase(), headers
    }, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let out = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'] || '';
        try {
          if (enc.includes('gzip')) out = zlib.gunzipSync(out);
          else if (enc.includes('deflate')) out = zlib.inflateSync(out);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: out.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    if (o.body) req.write(String(o.body));
    req.end();
  });
}

// 读取并 patch 明文源码
let src = fs.readFileSync(path.join(ROOT, '.upstream', 'jd_bean_info.js'), 'utf8');
// 1) 收集全部明细: detailList 遍历处
src = src.replace(
  'for (let item of detailList) {',
  'for (let item of detailList) { if (typeof __COLLECT !== "undefined") __COLLECT.push(item);'
);
if (!src.includes('__COLLECT.push')) { console.error('patch1 失败'); process.exit(1); }
// 2) 翻页停止条件: 到"前天"就 break → 改成 660 天前才停 (覆盖去年全年)
const before = src;
src = src.replace(
  /} else if \(tm > new Date\(date\)\.getTime\(\)\) \{\s*\/\/前天的\s*t = 1;\s*break;/,
  '} else if (tm > new Date(date).getTime()) {\n            //前天的(已patch: 拉到660天前才停)\n            if (new Date(date).getTime() < Date.now() - (parseInt(process.env.CUTOFF_DAYS||"660")*24*3600*1000)) { t = 1; break; }'
);
if (src === before) { console.error('patch2 失败'); process.exit(1); }

// sandbox
const sandbox = {
  console, Date, JSON, Math, String, Number, Array, Object, Promise, Error, RegExp, Map, Set,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN, Boolean, Buffer, URL,
  setTimeout, clearTimeout,
  __COLLECT: [],
  $prefs: {
    valueForKey: k => {
      if (k === 'CookieJD') return COOKIE;
      if (k === 'CookiesJD') return JSON.stringify([{ cookie: COOKIE }]);
      return '';
    },
    setValueForKey: () => {},
  },
  $notify: (t, s, b) => { console.log('[notify]', t, '|', String(s || '').slice(0, 100), '|', String(b || '').slice(0, 500)); },
  $done: () => { /* 结束标记 */ },
  $task: { fetch: o => {
    return taskFetch(o).then(r => {
      console.log('[http]', (o.method || 'GET'), String(o.url).slice(0, 110), '->', r.statusCode, '| body:', String(r.body).slice(0, 120));
      return r;
    }, e => { console.log('[http FAIL]', String(o.url).slice(0, 110), e.message); return Promise.reject(e); });
  } },
  require: p => {
    if (p === './USER_AGENTS') return { UARAM: () => UA, USER_AGENT: UA, USER_AGENTS: [UA] };
    if (p === './sendNotify') return { sendNotify: async () => {} };
    if (p === './jdCookie.js') return {};
    return {};
  },
  process: { env: {}, version: 'v20', platform: 'win32', exit: () => { throw new Error('EXIT'); } },
};
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { timeout: 300000 });
} catch (e) {
  if (e.message !== 'EXIT') console.log('执行异常:', e.message.slice(0, 150));
}

// 等主流程跑完(翻页间隔1秒/页, 660天约300页 → 最长5分钟)
setTimeout(() => {
  const all = sandbox.__COLLECT || [];
  fs.writeFileSync(path.join(__dirname, 'bean_detail_full.json'), JSON.stringify(all, null, 1));
  console.log(`\n=== 拉取完成: ${all.length} 条明细, 已存 bean_detail_full.json ===`);
  if (all.length) {
    console.log('最早一条:', all[all.length - 1].date, all[all.length - 1].eventMassage, all[all.length - 1].amount);
    console.log('最新一条:', all[0].date, all[0].eventMassage, all[0].amount);
  }
  process.exit(0);
}, parseInt(process.env.MAXWAIT||"330000"));
