/*
 * 京东 Cookie 有效性检测 + 失效自动清理（Quantumult X 原生版）
 * cron: 30 7 * * *
 *
 * 行为:
 *   1. 读取 BoxJs 的 CookiesJD / CookieJD / CookieJD2，按 pt_pin 去重
 *   2. 逐个调 me-api 检测有效性
 *   3. 明确失效（HTTP 200 且 retcode != 0）的 Cookie 从 BoxJs 中删除，并发通知
 *   4. 网络错误的不删（可能临时故障）；全部账号都失效时不删（多半是 API 抽风，避免误删）
 *   5. 检测到有效的 Cookie 推送到 ntfy（BoxJs 设置 JD_NTFY_TOPIC，同 qx_jd_all.js；不配置则不推）
 *
 * BoxJs 开关: JD_CKCHECK_AUTODEL = "true"（默认）自动删除；"false" 仅通知不删
 *             JD_NTFY_TOPIC = "mytopic"（可选）有效 CK 推送到 https://ntfy.sh/mytopic
 */

const TIMEOUT = 20000;
const CHECK_URL = 'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion?orgFlag=JD_MJ_H5&callSource=newmain&rfs=0';
const UA = 'jdapp;iPhone;11.0.4;15.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

function readPref(key) {
  try { return $prefs.valueForKey(key) || ''; } catch (e) { return ''; }
}
function writePref(value, key) {
  try { return $prefs.setValueForKey(value, key); } catch (e) { return false; }
}
// 取 cookie 里的 pt_pin 片段（含分号），用作身份匹配
function pinFragment(ck) {
  const m = (ck || '').match(/pt_pin=[^;]+;?/);
  return m ? m[0] : '';
}
function autoDeleteOn() {
  const v = readPref('JD_CKCHECK_AUTODEL');
  return v !== 'false'; // 默认开
}
// pin -> 手机号 映射: BoxJs 配置 JD_PIN_PHONE_MAP（JSON 对象，如 {"jd_xxx":"13800001234"}）
// 手机号来源: 青龙 JD_COOKIE 环境变量备注。未配置或 pin 无映射时通知只显示 pin
function phoneOf(pinFrag) {
  try {
    const map = JSON.parse(readPref('JD_PIN_PHONE_MAP') || '{}');
    const pin = decodeURIComponent((pinFrag || '').replace(/^pt_pin=|;$/g, ''));
    return map[pin] || '';
  } catch (e) { return ''; }
}

function collectCookies() {
  const out = [];
  const seen = new Set();
  const push = (ck) => {
    if (!ck || typeof ck !== 'string') return;
    const pf = pinFragment(ck);
    const k = pf || ck;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ cookie: ck.trim(), pin: pf });
  };
  try { JSON.parse(readPref('CookiesJD') || '[]').forEach(it => push(it.cookie)); } catch (e) {}
  push(readPref('CookieJD'));
  push(readPref('CookieJD2'));
  return out;
}

function checkOne(ck) {
  return new Promise(resolve => {
    $task.fetch({
      url: CHECK_URL,
      method: 'GET',
      headers: { 'Cookie': ck, 'User-Agent': UA, 'Referer': 'https://home.m.jd.com/', 'Accept': 'application/json' },
      timeout: TIMEOUT,
    }).then(resp => {
      let valid = false, name = '', retcode = '', definitive = false;
      try {
        const j = JSON.parse(resp.body || '{}');
        retcode = j.retcode || '';
        if (retcode === '0' && j.data && j.data.userInfo && j.data.userInfo.baseInfo) {
          valid = true;
          name = j.data.userInfo.baseInfo.nickname || j.data.userInfo.baseInfo.curPin || '';
        } else if (resp.statusCode === 200) {
          // HTTP 200 但 retcode 非 0：明确失效
          definitive = true;
        }
      } catch (e) {}
      resolve({ valid, name, retcode, definitive, netError: false });
    }).catch(e => {
      resolve({ valid: false, name: '', retcode: 'NET_ERR', definitive: false, netError: true, error: String(e).slice(0, 80) });
    });
  });
}

// ntfy 推送地址：BoxJs 配置 JD_NTFY_TOPIC（与 qx_jd_all.js 共用同一开关），不配置返回 null
function getNtfyUrl() {
  const topic = readPref('JD_NTFY_TOPIC');
  if (topic && topic !== 'false') return 'https://ntfy.sh/' + topic.trim();
  return null;
}

// ntfy 推送（Promise 版，task 环境优先 $task.fetch，回退 $httpClient）
function pushNtfy(url, body, title) {
  return new Promise(resolve => {
    let done = false;
    const finish = (ok, info) => {
      if (done) return;
      done = true;
      try { clearTimeout(timer); } catch (e) {}
      console.log(ok ? '[NTFY] 推送成功: ' + title : '[NTFY] 推送失败: ' + info);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false, 'timeout 8s'), 8000);
    const opts = { url, headers: { 'Content-Type': 'text/plain', 'Title': title }, body };
    if (typeof $task !== 'undefined' && $task.fetch) {
      $task.fetch(Object.assign({ method: 'POST' }, opts)).then(
        resp => finish(!!resp && resp.statusCode >= 200 && resp.statusCode < 300, resp ? 'HTTP ' + resp.statusCode : 'no response'),
        e => finish(false, e ? (e.error || String(e)) : 'unknown')
      );
      return;
    }
    if (typeof $httpClient !== 'undefined' && $httpClient.post) {
      try {
        $httpClient.post(opts, (error, response) => {
          const code = response && response.statusCode ? response.statusCode : 0;
          finish(!error && code >= 200 && code < 300, error || ('HTTP ' + code));
        });
        return;
      } catch (e) {}
    }
    finish(false, '无可用 HTTP API');
  });
}

// 按 invalidPins 集合清理各 Cookie 来源，返回删除明细
function cleanupInvalid(invalidPins) {
  const details = [];
  if (!invalidPins.size) return details;

  // CookiesJD: JSON 数组，过滤掉失效条目
  try {
    const arr = JSON.parse(readPref('CookiesJD') || '[]');
    const kept = [];
    let removed = 0;
    arr.forEach(it => {
      if (invalidPins.has(pinFragment(it.cookie || ''))) {
        removed++;
        details.push('CookiesJD 移除: ' + (pinFragment(it.cookie) || '未知pin'));
      } else {
        kept.push(it);
      }
    });
    if (removed > 0) writePref(JSON.stringify(kept), 'CookiesJD');
  } catch (e) {
    console.log('[CK检测] 清理 CookiesJD 失败: ' + e);
  }

  // CookieJD / CookieJD2: 单字符串，失效则清空
  ['CookieJD', 'CookieJD2'].forEach(key => {
    const v = readPref(key);
    if (v && invalidPins.has(pinFragment(v))) {
      writePref('', key);
      details.push(key + ' 已清空: ' + pinFragment(v));
    }
  });

  return details;
}

(async () => {
  const cookies = collectCookies();
  if (!cookies.length) {
    console.log('[CK检测] 未找到任何 Cookie');
    $notify('CK检测', '未找到 Cookie', '请先在 BoxJs 配置 CookiesJD / CookieJD，或打开京东 App 抓包');
    return $done({});
  }

  console.log('[CK检测] 共 ' + cookies.length + ' 个账号，开始检测... (自动清理: ' + (autoDeleteOn() ? '开' : '关') + ')');
  const results = [];
  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i];
    const r = await checkOne(c.cookie);
    const label = c.pin ? decodeURIComponent(c.pin.replace(/^pt_pin=|;$/g, '')) : ('账号' + (i + 1));
    const phone = phoneOf(c.pin);
    const display = phone ? phone + ' ' + label : label;   // 手机号在前更直观, 无映射时仅 pin
    let status;
    if (r.valid) status = '✅ 有效' + (r.name ? ' (' + r.name + ')' : '');
    else if (r.netError) status = '⚠️ 网络错误（保留不删）retcode=' + r.retcode;
    else status = '❌ 失效 (retcode=' + r.retcode + ')';
    console.log('  [' + (i + 1) + '] ' + display + ': ' + status);
    results.push({ label: display, pin: c.pin, cookie: c.cookie, ...r });
  }

  const valid = results.filter(r => r.valid);
  const definitive = results.filter(r => !r.valid && r.definitive);
  const netErr = results.filter(r => r.netError);

  // ntfy 外推：检测到有效的 Cookie 逐个推送完整 cookie 行（标题格式与 qx_jd_all.js 一致）
  const ntfyUrl = getNtfyUrl();
  if (ntfyUrl && valid.length) {
    console.log('[CK检测] 推送 ' + valid.length + ' 个有效 Cookie 到 ntfy...');
    for (const r of valid) {
      const pin = decodeURIComponent((r.pin || '').replace(/^pt_pin=|;$/g, ''));
      await pushNtfy(ntfyUrl, r.cookie, 'JD_cookie_' + (pin || r.label));
    }
  } else if (!ntfyUrl && valid.length) {
    console.log('[CK检测] 未配置 JD_NTFY_TOPIC，跳过 ntfy 外推');
  }

  // 失效 pin 集合
  const invalidPins = new Set(definitive.map(r => r.pin));

  // 安全阀: 全部账号都失效（无一个有效）时，怀疑是 API 故障，不自动删除
  const allFailed = valid.length === 0 && results.length > 0;
  const doCleanup = autoDeleteOn() && !allFailed && invalidPins.size > 0;

  let cleanupDetails = [];
  if (doCleanup) {
    cleanupDetails = cleanupInvalid(invalidPins);
    console.log('[CK检测] 已自动清理 ' + cleanupDetails.length + ' 条失效 Cookie');
  } else if (allFailed && invalidPins.size > 0) {
    console.log('[CK检测] 全部账号失效，疑似 API 故障，保留不删（仅通知）');
  }

  // 通知
  const title = 'CK检测 ' + valid.length + '/' + results.length + ' 有效' +
    (definitive.length ? '，' + definitive.length + '失效' : '') +
    (netErr.length ? '，' + netErr.length + '网络异常' : '');
  let body = results.map(r => {
    const m = r.valid ? '✅' : (r.netError ? '⚠️' : '❌');
    return m + ' ' + r.label;
  }).join('\n');
  if (cleanupDetails.length) {
    body += '\n\n🗑 已自动清理:\n' + cleanupDetails.join('\n');
  } else if (allFailed && invalidPins.size > 0) {
    body += '\n\n⚠️ 全部失效，疑似 API 故障未自动清理，请稍后重试或手动检查';
  } else if (netErr.length) {
    body += '\n\n⚠️ 有网络异常账号，保留未删，下次检测再处理';
  }
  $notify(title, '', body);
  console.log('[CK检测] 完成: ' + valid.length + ' 有效, ' + definitive.length + ' 失效, ' + netErr.length + ' 网络异常');
  $done({});
})();
