const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '', ws = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
const wi = c.indexOf('wskey=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];
if (wi >= 0) ws = c.substring(wi + 6).split(';')[0];

if (pin && key) {
  console.log('[JD] pt_key=' + key + ';pt_pin=' + pin + ';');
}
if (ws) {
  console.log('[JD] wskey=' + ws + ';' + (pin ? 'pin=' + pin : ''));
}
$done({});
