/**
 * 京东 Cookie 抓取 - 不用正则
 */
const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

// 用 indexOf + split 代替正则
let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) { const s = c.substring(pi + 7); pin = s.split(';')[0]; }
if (ki >= 0) { const s = c.substring(ki + 7); key = s.split(';')[0]; }

if (pin && key) {
  $notify('京东Cookie', pin, key);
}

$done({});
