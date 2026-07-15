const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';
const body = $response.body || '';

let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];

if (pin && key) {
  console.log('[JD-COOKIE] ' + 'pt_key=' + key + ';pt_pin=' + pin + ';');
  $notify('京东Cookie', pin, key);
}

$done({body: body});
