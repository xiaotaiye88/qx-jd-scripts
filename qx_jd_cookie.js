/**
 * 京东 Cookie 抓取 (Quantumult X)
 * 订阅: https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/jd_scripts.conf
 */
const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const pt_pin = (cookie.match(/pt_pin=([^;]+)/) || [])[1];
const pt_key = (cookie.match(/pt_key=([^;]+)/) || [])[1];
if (pt_pin && pt_key) { $notification.post('京东Cookie', pt_pin, pt_key); }
$done({});
