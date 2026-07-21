/**
 * JD Cookie 抓取 (Quantumult X rewrite)
 * 订阅: https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/jd_scripts.conf
 *
 * 使用 script-response-body 以获得完整 API 权限（$notify / $prefs / $task.fetch）
 * 参考 NobyDa Ctrip 脚本的 QX API 用法
 *
 * 推送配置: 在 BoxJs 设置 JD_NTFY_TOPIC（如 "mytopic"），脚本会推送到 https://ntfy.sh/mytopic
 *          不配置则仅本地存储，不外推
 */

// 从 BoxJs 读取 ntfy topic（不配置则不推送）
function getNtfyUrl() {
  try {
    if (typeof $prefs !== "undefined") {
      const topic = $prefs.valueForKey("JD_NTFY_TOPIC");
      if (topic && topic !== "false" && topic !== "") {
        return "https://ntfy.sh/" + topic.trim();
      }
    }
  } catch (_) {}
  return null;
}

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

  const old = $prefs.valueForKey('jd_cookies') || '';
  $prefs.setValueForKey('jd_cookies', '[' + ts + '] ' + cookie + '\n' + old);

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
  const ntfyUrl = getNtfyUrl();
  if (ntfyUrl) {
    $task.fetch({
      url: ntfyUrl,
      method: 'post',
      headers: { 'Content-Type': 'text/plain' },
      body: ntfyBody.trim()
    }).then(
      r => { console.log('[JD] ntfy推送成功'); $done({}); },
      e => { console.log('[JD] ntfy推送失败: ' + e); $done({}); }
    );
  } else {
    console.log('[JD] 未配置 JD_NTFY_TOPIC，仅本地存储');
    $done({});
  }
} else {
  $done({});
}
