// 自检：h5st 公共签名模块能加载、能出签名、appId 映射生效。
// 用法: node tools/check-h5st.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const MOD = path.join(ROOT, 'src', 'vendor', 'h5st.js');

assert.ok(fs.existsSync(MOD), 'src/vendor/h5st.js 不存在');
const H5st = require(MOD);

// 1) 导出齐全
for (const k of ['init', 'sign', 'buildQuery', 'sha256hex', 'APPID_MAP']) {
  assert.ok(H5st[k], 'h5st 缺少导出 ' + k);
}

// 2) appId 映射来自抓包实测，少一个签名就会 403
const NEED = ['apStartTaskTime', 'apsDoTask', 'apTaskDrawAward', 'farm_home', 'farm_water',
  'farm_task_list', 'superRedBagHome', 'interact_act_invoke'];
for (const fn of NEED) {
  assert.ok(H5st.APPID_MAP[fn], 'APPID_MAP 缺少 ' + fn);
}

// 3) 真签一次：签名必须 10 段、第 3 段等于传入的 appId
(async () => {
  H5st.init('pt_key=selftest;pt_pin=selftest;', { clientVersion: '16.1.50' });
  await new Promise((r) => setTimeout(r, 2200));

  let h = null;
  for (let i = 0; i < 3 && !h; i++) {
    h = H5st.sign('farm_task_list', { version: 18, channelParam: '1' }, 'c57f6');
    if (!h) await new Promise((r) => setTimeout(r, 1500));
  }
  assert.ok(h, 'h5st 签名为空（SDK 未就绪？）');

  const seg = h.split(';');
  assert.strictEqual(seg.length, 10, 'h5st 段数应为 10，实际 ' + seg.length);
  assert.strictEqual(seg[2], 'c57f6', 'h5st 第 3 段应为 appId c57f6，实际 ' + seg[2]);
  assert.strictEqual(seg[5], '5.3', 'h5st 版本段应为 5.3');
  assert.ok(seg[0].length === 17, 'h5st 时间戳段应为 17 位');

  console.log('✅ h5st 自检通过：导出齐全 / APPID_MAP ' + Object.keys(H5st.APPID_MAP).length + ' 项 / 签名 ' + seg.length + ' 段正常');
  process.exit(0);
})();
