/**
 * 京东 Cookie 抓取 - Step 3: 不用正则，纯 indexOf
 */
const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const hasPin = cookie.indexOf('pt_pin=') !== -1;
const hasKey = cookie.indexOf('pt_key=') !== -1;
console.log('[JD] cookie存在=' + (cookie.length > 0) + ' 有pin=' + hasPin + ' 有key=' + hasKey);
$done({});
