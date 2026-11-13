// 自检：确认打包产物与 prelude 垫片满足 Dylan 脚本的隐性依赖。
// 这三处任一回归，jd_water_new / 同类签名脚本都会静默失败（不报错、返回空对象）。
// 用法: node tools/check-dylan-deps.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const prelude = fs.readFileSync(path.join(ROOT, 'src', 'prelude.js'), 'utf8');
const bundle = fs.readFileSync(path.join(ROOT, 'scripts', 'jd_water_new.qx.js'), 'utf8');

// 1) axios 垫片必须给字符串 data 补 x-www-form-urlencoded，
//    否则 gia.jd.com/jsTk.do 回 {"code":20,"msg":"Invalid param"} → jddToken 解出 undefined
assert.ok(
  /config\.data !== undefined && typeof config\.data === 'string'/.test(prelude) &&
  /application\/x-www-form-urlencoded/.test(prelude.slice(prelude.indexOf('axios 子集垫片'))),
  'prelude: axios 垫片缺少字符串 data 的 content-type 兜底'
);

// 2) dylans 必须无条件打包（混淆脚本的 require 运行时解码，静态扫描看不见）
assert.ok(/deps\.add\('\.\/function\/dylans'\)/.test(fs.readFileSync(path.join(ROOT, 'tools', 'build-all.js'), 'utf8')),
  'build-all: dylans 未无条件打包');

// 3) USER_AGENTS 必须是真实模块（有 UARAM），不能是 prelude 的 3 条 UA 数组桩
const uaPath = fs.existsSync(path.join(ROOT, '.upstream', 'USER_AGENTS.js')) ? path.join(ROOT, '.upstream', 'USER_AGENTS.js') : path.join(ROOT, 'src', 'vendor', 'USER_AGENTS.js');
const ua = require(uaPath);
assert.strictEqual(typeof ua.UARAM, 'function', '.upstream/USER_AGENTS.js 缺少 UARAM 导出');
assert.strictEqual(typeof ua.USER_AGENT, 'string', '.upstream/USER_AGENTS.js 缺少 USER_AGENT 导出');

// 4) 产物里三样都得到位（注册表里排后面的定义会覆盖 prelude 的桩）
const defined = [...bundle.matchAll(/__qxDefine\((["'])(.+?)\1/g)].map((m) => m[2]);
for (const name of ['./function/dylans', './function/dylib', './USER_AGENTS']) {
  assert.ok(defined.includes(name), `产物缺少模块 ${name}`);
}
assert.ok(defined.lastIndexOf('./USER_AGENTS') > 0, '产物未注册 ./USER_AGENTS');

console.log('✅ dylan 依赖自检通过：axios CT 兜底 / dylans / USER_AGENTS 均在位');
