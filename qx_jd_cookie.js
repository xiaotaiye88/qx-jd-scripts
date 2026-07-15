/**
 * 京东 Cookie 抓取 - Step 1: 只读cookie打日志
 */
const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
console.log('[JD] cookie长度: ' + cookie.length);
$done({});
