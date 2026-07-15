const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];

if (pin && key) {
  const full = 'pt_key=' + key + ';pt_pin=' + pin + ';';

  // 去重：同账号5分钟不重复
  const last = $persistentStore.read('jd_ts_' + pin) || '0';
  if ((Date.now() - parseInt(last)) > 300000) {
    $persistentStore.write(String(Date.now()), 'jd_ts_' + pin);
    $persistentStore.write(full, 'jd_ck_' + pin);
    $persistentStore.write(full, 'jd_last');
    console.log('[JD-COOKIE] 已存储: ' + full);
    $notify('京东Cookie已抓取', pin, '已存入QX存储，长按可复制');
  } else {
    console.log('[JD-COOKIE] 去重跳过: ' + pin);
  }
}
$done({});
