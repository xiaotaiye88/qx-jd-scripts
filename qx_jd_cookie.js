const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];

if (pin && key) {
  console.log('[JD-COOKIE] ' + 'pt_key=' + key + ';pt_pin=' + pin + ';');

  // 尝试推送到本地同步服务（如果运行的话）
  try {
    $httpClient.post('http://192.168.19.192:3456/', {
      'Content-Type': 'text/plain'
    }, 'pt_key=' + key + ';pt_pin=' + pin + ';', function(err, resp, data) {
      if (!err) console.log('[JD-COOKIE] 推送成功'); else console.log('[JD-COOKIE] 推送失败');
    });
  } catch(e) {
    console.log('[JD-COOKIE] httpClient不可用: ' + e);
  }
}

$done({});
