const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) { pin = c.substring(pi + 7).split(';')[0]; }
if (ki >= 0) { key = c.substring(ki + 7).split(';')[0]; }

if (pin && key) {
  console.log('[JD-COOKIE] pt_pin=' + pin + ';pt_key=' + key + ';');
  $notify('京东Cookie', pin, key);
} else if (c.length > 0) {
  console.log('[JD-COOKIE] 有cookie但无pt: ' + c.substring(0, 120));
}

$done({});
