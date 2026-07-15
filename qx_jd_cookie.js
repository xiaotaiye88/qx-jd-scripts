/**
 * 京东 Cookie 抓取 - 诊断版
 * 先只打日志不弹通知，确认脚本能跑通
 */
const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const pin = (c.match(/pt_pin=([^;]+)/) || [])[1];
const key = (c.match(/pt_key=([^;]+)/) || [])[1];
console.log('[JD] pin=' + (pin||'无') + ' key=' + (key||'无').substring(0,20));
$done({});
