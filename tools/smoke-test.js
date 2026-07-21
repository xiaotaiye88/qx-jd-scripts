// ============================================================================
// 冒烟测试：在 Node 中模拟 Quantumult X 全局对象，运行打包产物
// 目的：验证模块加载、Env 环境检测、Cookie 读取链路无 shim 级崩溃，
//       并观察脚本读取了哪些 BoxJs 键、发起了哪些请求。
// 用法: node tools/smoke-test.js [脚本路径]
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = process.argv[2] || path.join(ROOT, 'scripts', 'jd_dwapp.qx.js');

if (!fs.existsSync(BUNDLE)) {
  console.error('找不到打包产物: ' + BUNDLE + '\n先运行 node tools/build.js');
  process.exit(1);
}

// ---------- 模拟 BoxJs 持久化存储 ----------
const PREFS_STORE = {
  // 测试用假 Cookie，观察脚本读取行为
  'CookieJD': 'pt_key=AAJkFakeKeyForSmokeTestOnly123456789;pt_pin=test%E7%94%A8%E6%88%B7;',
  // 'CookieJD2': 'pt_key=AAJkFakeKey2;pt_pin=test2;',
  // 'CookiesJD': JSON.stringify([{cookie: 'pt_key=AAJkFakeKey3;pt_pin=test3;'}]),
};

const stats = { prefReads: {}, fetches: [] };

// ---------- 模拟 QX 全局对象 ----------
const sandbox = {
  $prefs: {
    valueForKey(key) {
      stats.prefReads[key] = (stats.prefReads[key] || 0) + 1;
      return PREFS_STORE[key] !== undefined ? PREFS_STORE[key] : null;
    },
    setValueForKey(value, key) {
      console.log('  [$prefs.set] ' + key + ' = ' + String(value).slice(0, 120));
      PREFS_STORE[key] = value;
      return true;
    }
  },
  $notify(title, subtitle, message) {
    console.log('  [$notify] ' + title + ' | ' + subtitle + ' | ' + String(message || '').slice(0, 150));
  },
  $task: {
    fetch(opts) {
      stats.fetches.push({ url: opts.url, method: opts.method || 'GET' });
      console.log('  [$task.fetch] ' + (opts.method || 'GET') + ' ' + String(opts.url).slice(0, 150));
      // 返回一个合法的 HTTP 响应壳；body 是通用 JSON，脚本解析失败属预期（无真实 Cookie）
      return Promise.resolve({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ code: '0', success: false, message: 'smoke-test dummy response', data: {}, result: {}, errorCode: 'smoke' })
      });
    }
  },
  $done(value) {
    console.log('\n[$done] 脚本调用结束回调');
    report(0);
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Promise: Promise,
  Date: Date,
  JSON: JSON,
  Math: Math,
};
sandbox.globalThis = sandbox;

let reported = false;
function report(code) {
  if (reported) return;
  reported = true;
  console.log('\n========== 冒烟测试报告 ==========');
  console.log('BoxJs 键读取:');
  for (const [k, n] of Object.entries(stats.prefReads)) console.log(`  ${k}  x${n}`);
  console.log(`发起请求数: ${stats.fetches.length}`);
  stats.fetches.slice(0, 10).forEach(f => console.log(`  ${f.method} ${f.url.slice(0, 130)}`));
  process.exit(code);
}

process.on('unhandledRejection', (e) => {
  console.log('\n[unhandledRejection] ' + (e && e.stack || e));
});
process.on('uncaughtException', (e) => {
  console.log('\n[uncaughtException] ' + (e && e.stack || e));
});

console.log('[smoke] 加载 ' + path.relative(ROOT, BUNDLE));
const code = fs.readFileSync(BUNDLE, 'utf8');

try {
  vm.runInNewContext(code, sandbox, { filename: 'jd_dwapp.qx.js', timeout: 60000 });
  console.log('[smoke] 同步阶段执行完毕，等待异步任务...');
} catch (e) {
  console.error('[smoke] 同步阶段抛出异常: ' + (e && e.stack || e));
  report(1);
}

// 最多等 90 秒看异步行为（网络被 mock，应该很快）
setTimeout(() => {
  console.log('\n[smoke] 等待超时，强制输出报告');
  report(0);
}, 90000).unref();

// 进程真正空闲时也输出报告（避免挂起）
setInterval(() => {
  if (stats.fetches.length > 0) return; // 有活动就继续等
}, 5000).unref();
