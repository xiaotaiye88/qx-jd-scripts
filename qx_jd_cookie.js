/**
 * 京东 Cookie 抓取 - Step 2: 加正则匹配
 */
const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];
console.log('[JD] pin=' + (pt_pin||'无') + ' key=' + (pt_key||'无').substring(0,20));
$done({});
