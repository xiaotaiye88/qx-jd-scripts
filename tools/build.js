// ============================================================================
// 构建脚本：把青龙版 jd_dwapp.js 及其依赖打包成 Quantumult X 单文件脚本
// 用法: node tools/build.js [--refresh]
//   --refresh  忽略本地缓存，重新从上游下载
// 环境变量:
//   PROXY  下载代理，如 http://192.168.0.235:7890（默认不用代理）
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.upstream');
const OUT = path.join(ROOT, 'scripts');
const PROXY = process.env.PROXY || '';
const REFRESH = process.argv.includes('--refresh');

// 上游文件清单：本地缓存名 -> 下载地址
const UPSTREAM = {
  'jd_dwapp.js':   'https://raw.githubusercontent.com/6dylan6/jdpro/main/jd_dwapp.js',
  'dylib.js':      'https://raw.githubusercontent.com/6dylan6/jdpro/main/function/dylib.js',
  'dyland.js':     'https://raw.githubusercontent.com/6dylan6/jdpro/main/function/dyland.js',
  'dylanx.js':     'https://raw.githubusercontent.com/6dylan6/jdpro/main/function/dylanx.js',
  'dylans.js':     'https://raw.githubusercontent.com/6dylan6/jdpro/main/function/dylans.js',
  'crypto-js.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js',
};

// require 字面量 -> 上游缓存文件名（字面量必须与混淆代码里的写法完全一致）
const MODULE_MAP = {
  './function/dylib':  'dylib.js',
  './dyland.js':       'dyland.js',
  './function/dylanx': 'dylanx.js',
  './function/dylans': 'dylans.js',
  'crypto-js':         'crypto-js.min.js',
};

function download(name, url) {
  const dest = path.join(CACHE, name);
  if (!REFRESH && fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`  缓存命中 ${name} (${fs.statSync(dest).size} bytes)`);
    return;
  }
  console.log(`  下载 ${name} <- ${url}`);
  const args = ['-sL', '--fail', '--connect-timeout', '20', '--retry', '3'];
  if (PROXY) args.push('-x', PROXY);
  args.push(url, '-o', dest);
  execFileSync('curl', args, { stdio: 'inherit' });
  const size = fs.statSync(dest).size;
  if (size < 1000) throw new Error(`${name} 下载结果异常小 (${size} bytes)，可能失败`);
  console.log(`  -> ${size} bytes`);
}

/** 把 CommonJS 源文件包成注册表中的一个惰性模块 */
function wrapModule(requireName, source, dirname) {
  return `
// ===== module: ${requireName} =====
__qxDefine(${JSON.stringify(requireName)}, function () {
  var module = { exports: {} };
  var exports = module.exports;
  var __dirname = ${JSON.stringify(dirname)};
  var __filename = ${JSON.stringify(dirname + '/' + requireName.split('/').pop())};
${source}
  return module.exports;
});
`;
}

function main() {
  console.log('[build] 准备上游文件...');
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url] of Object.entries(UPSTREAM)) download(name, url);

  console.log('[build] 组装打包...');
  const parts = [];

  // 1) 文件头
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  parts.push(`/*
 * 积分换话费 (jd_dwapp) — Quantumult X 打包版
 * 上游: https://github.com/6dylan6/jdpro (jd_dwapp.js, 青龙版)
 * 构建: ${now} 由 tools/build.js 自动生成，请勿手工编辑
 * 仓库: https://github.com/xiaotaiye88/qx-jd-scripts
 *
 * cron: 38 2,15 * * *
 * BoxJs: 需配置 CookieJD（或 CookieJD2.../CookiesJD）
 */`);

  // 2) QX 兼容层
  parts.push('\n// ==================== prelude ====================');
  parts.push(fs.readFileSync(path.join(ROOT, 'src', 'prelude.js'), 'utf8'));

  // 3) 依赖模块（保持加载顺序无关，全部惰性）
  for (const [requireName, file] of Object.entries(MODULE_MAP)) {
    const src = fs.readFileSync(path.join(CACHE, file), 'utf8');
    const dirname = requireName.startsWith('./function/') ? '/function' : '/function';
    parts.push(wrapModule(requireName, src, dirname));
  }

  // 4) crypto-js 需要在全局可用（主脚本非 Node 分支回退到全局 CryptoJS）
  parts.push(`
var CryptoJS = require('crypto-js');
`);

  // 5) 主脚本（立即执行）
  // 注意：主脚本内嵌 Env 通过 `typeof module !== 'undefined'` 判断 Node 环境，
  // 这里绝不能声明 module/exports，否则会被误判为 Node 而丢掉 QX 代码分支。
  const mainSrc = fs.readFileSync(path.join(CACHE, 'jd_dwapp.js'), 'utf8');
  parts.push(`
// ===== 主脚本: jd_dwapp.js（立即执行） =====
(function () {
  var __dirname = '/';
  var __filename = 'jd_dwapp.js';
${mainSrc}
})();
`);

  const bundle = parts.join('\n');
  const outFile = path.join(OUT, 'jd_dwapp.qx.js');
  fs.writeFileSync(outFile, bundle);
  console.log(`[build] 完成 -> ${path.relative(ROOT, outFile)} (${bundle.length} chars, ${Buffer.byteLength(bundle)} bytes)`);
}

main();
