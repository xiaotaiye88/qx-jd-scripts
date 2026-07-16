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

if (pin && key) {
  const cookie = 'pt_key=' + key + ';pt_pin=' + pin + ';';
  console.log('[JD] ' + cookie);

  // 持久化到 QX prefs（圈X → 底部"设置" → "持久化数据" 查看/复制）
  const old = $prefs.valueForKey('jd_cookies') || '';
  $prefs.setValueForKey('jd_cookies', '[' + ts + '] ' + cookie + '\n' + old);

  // 弹窗通知（第4个参数为 QX 专用格式）
  $notify('JD Cookie 已更新', pin, key.slice(0, 40) + '...', {
    'update-pasteboard': cookie
  });
}

if (ws) {
  const wskeyStr = 'wskey=' + ws + ';' + (pin ? 'pt_pin=' + pin + ';' : '');
  console.log('[JD] ' + wskeyStr);

  const oldWs = $prefs.valueForKey('jd_wskeys') || '';
  $prefs.setValueForKey('jd_wskeys', '[' + ts + '] ' + wskeyStr + '\n' + oldWs);

  $notify('JD Wskey 已更新', pin || '(无pin)', ws.slice(0, 30) + '...', {
    'update-pasteboard': wskeyStr
  });
}

$done({});
