/**
 * 京东 Cookie 抓取 (Quantumult X) - 响应版
 *
 * 圈X → 风车 → 重写 → 右上角+ → 类型: script-response-header
 * URL: ^https?://api\.m\.jd\.com/
 *
 * 拦截响应头（响应最快阶段），不碰请求/响应体
 */

const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];

if (pt_pin && pt_key) {
  $notification.post('京东Cookie', pt_pin, pt_key);
}

$done({});
