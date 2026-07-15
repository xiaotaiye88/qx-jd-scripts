/**
 * 圈X重写脚本 - 京东 Cookie 自动捕获 + 弹窗
 *
 * === 配置方法 ===
 * 圈X → 风车 → 重写 → 右上角+ → 类型选 script-request-header
 * URL 填: ^https?://api\.m\.jd\.com/
 * 脚本: 贴入本文件全部内容
 *
 * 效果：打开京东App后自动弹窗显示 pt_pin + pt_key，
 *       点击通知可复制，通知中心可回溯。
 */

const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';

if (!cookie) {
  $done({});
}

const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];

if (!pt_pin || !pt_key) {
  $done({});
}

// 去重：同一 pin 在 5 分钟内不重复弹
const dedupKey = 'jd_ck_last_' + pt_pin;
const last = $persistentStore.read(dedupKey) || '0';
const now = Date.now();
if (now - parseInt(last) < 300000) {
  $done({});
}
$persistentStore.write(String(now), dedupKey);

// 弹窗通知：标题显示 pin，副标题是 pt_key（可滑动复制），长按复制完整cookie
const fullCookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

$notify(
  '京东Cookie',                          // 标题
  pt_pin,                                // 副标题（pin）
  pt_key + '\n\n长按复制上方pt_key',       // 正文（key）
  { 'url': 'jdlogin://' }                // 点击无实际跳转
);

// 同时写入圈X日志，方便回溯
console.log(`\n========== JD Cookie ==========
pt_pin=${pt_pin}
pt_key=${pt_key}
完整: ${fullCookie}
================================\n`);

$done({});
