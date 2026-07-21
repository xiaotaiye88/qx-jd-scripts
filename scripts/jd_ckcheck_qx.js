/*
 * 京东 Cookie 有效性检测 + 失效自动清理（Quantumult X 原生版）
 * cron: 30 7 * * *
 *
 * 行为:
 *   1. 读取 BoxJs 的 CookiesJD / CookieJD / CookieJD2，按 pt_pin 去重
 *   2. 逐个调 me-api 检测有效性
 *   3. 明确失效（HTTP 200 且 retcode != 0）的 Cookie 从 BoxJs 中删除，并发通知
 *   4. 网络错误的不删（可能临时故障）；全部账号都失效时不删（多半是 API 抽风，避免误删）
 *
 * BoxJs 开关: JD_CKCHECK_AUTODEL = "true"（默认）自动删除；"false" 仅通知不删
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
    const label = c.pin ? decodeURIComponent(c.pin.replace(/;$/, '')) : ('账号' + (i + 1));
    let status;
    if (r.valid) status = '✅ 有效' + (r.name ? ' (' + r.name + ')' : '');
    else if (r.netError) status = '⚠️ 网络错误（保留不删）retcode=' + r.retcode;
    else status = '❌ 失效 (retcode=' + r.retcode + ')';
    console.log('  [' + (i + 1) + '] ' + label + ': ' + status);
    results.push({ label, pin: c.pin, ...r });
  }

  const valid = results.filter(r => r.valid);
  const definitive = results.filter(r => !r.valid && r.definitive);
  const netErr = results.filter(r => r.netError);

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
