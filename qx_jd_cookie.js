const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const body = $response.body || '';

let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];

if (pin && key) {
  const full = 'pt_key=' + key + ';pt_pin=' + pin + ';';
  const last = $persistentStore.read('jd_ts_' + pin) || '0';
  if ((Date.now() - parseInt(last)) > 300000) {
    $persistentStore.write(String(Date.now()), 'jd_ts_' + pin);
    $persistentStore.write(full, 'jd_last');
    console.log('[JD-COOKIE] ' + full);
    $notify('京东Cookie', pin, key.substring(0, 50) + '...');
  }
}

$done({body: body});
