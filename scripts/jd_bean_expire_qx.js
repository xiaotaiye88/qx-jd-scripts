/*
 * 京豆过期统计（Quantumult X 原生版）— 精确查询
 * cron: 23 10 1 * *   （每月1日 + 可随时手动跑）
 *
 * 数据源（2026-10 逆向京东 App「权益中心」抓包验证）:
 *   POST https://api.m.jd.com/api?functionId=bff_rightsCenter_userInfo&scene=userInfo
 *   body: appid=plus_business&body={"scene":"userInfo","contentType":"28_29"}&...
 *   无需 h5st 签名, 纯 pt_key;pt_pin cookie 即可。
 *   返回官方精确值: expireBeans(将过期豆)/expireDays(天数)/jingBeans(余额)/jingBeanValue(元)
 *
 * 历史: 旧的过期接口 queryexpirejingdou 已下线(返回空); 明细接口 getJingBeanBalanceDetail
 *       风控 403。本接口是京东 App「我的-京豆」页面同一数据源。
 *
 * Cookie 失效(F10002 用户未登陆)时提示跑 CK检测 更新。
 */

const TIMEOUT = 20000;
const API = 'https://api.m.jd.com/api?functionId=bff_rightsCenter_userInfo&scene=userInfo';
const UA = 'jdapp;iPhone;16.1.30;;;M/5.0;appBuild/171082;jdSupportDarkMode/0;lang/zh_CN;ctype/0;site/CN;ccy/CNY;elder/0;ef/1;';

function readPref(key) {
  try { return $prefs.valueForKey(key) || ''; } catch (e) { return ''; }
}
function pinFragment(ck) {
  const m = (ck || '').match(/pt_pin=[^;]+;?/);
  return m ? m[0] : '';
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

function queryUserInfo(ck) {
  return new Promise(resolve => {
    const body = 'appid=plus_business&functionId=bff_rightsCenter_userInfo&body='
      + encodeURIComponent(JSON.stringify({ scene: 'userInfo', contentType: '28_29' }))
      + '&loginType=2&loginWQBiz=&xAPIClientLanguage=zh_CN&scval=undefined&t=' + Date.now();
    $task.fetch({
      url: API,
      method: 'POST',
      headers: {
        'Cookie': ck,
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://pro.m.jd.com/mall/active/4E1fFrgX1eGtWTc5KBNFzXMrh6xn/index.html',
        'Origin': 'https://pro.m.jd.com',
      },
      body,
      timeout: TIMEOUT,
    }).then(resp => {
      try {
        if (resp.statusCode !== 200) { resolve({ err: 'HTTP ' + resp.statusCode }); return; }
        const j = JSON.parse(resp.body || '');
        if (j.code === '1711000' && j.rs) {
          resolve({ rs: j.rs });
        } else if (j.code === 'F10002') {
          resolve({ err: 'cookie失效(用户未登陆)' });
        } else {
          resolve({ err: 'code=' + j.code + ' ' + (j.msg || '') });
        }
      } catch (e) { resolve({ err: '解析失败: ' + e.message }); }
    }, err => resolve({ err: '网络错误: ' + (err && err.message || err) }));
  });
}

(async () => {
  const accounts = collectCookies();
  if (!accounts.length) {
    $notify('京豆过期统计', '❌ 未找到 Cookie', '请先在 BoxJs 配置 CookiesJD');
    $done();
    return;
  }
  console.log('京豆过期统计(权益中心精确查询): 共 ' + accounts.length + ' 个账号');
  const lines = [];
  for (const acc of accounts) {
    const pinRaw = (acc.pin.match(/pt_pin=([^;]+);?/) || [])[1] || '账号';
    const name = decodeURIComponent(pinRaw);
    const r = await queryUserInfo(acc.cookie);
    if (r.err) {
      console.log('[' + name + '] ❌ ' + r.err);
      lines.push(`❌ ${name}: ${r.err}${r.err.includes('失效') ? '（跑CK检测更新）' : ''}`);
      continue;
    }
    const rs = r.rs;
    const beans = parseInt(rs.jingBeans, 10) || 0;
    const exp = parseInt(rs.expireBeans, 10) || 0;
    const days = parseInt(rs.expireDays, 10) || 0;
    const val = rs.jingBeanValue || (beans / 100).toFixed(2);
    console.log(`[${name}] 余额${beans}豆, ${days}天内过期${exp}豆`);
    lines.push(
      exp > 0
        ? `⚠️ ${name}: 余额 ${beans} 豆(¥${val})，${days} 天内过期 ${exp} 豆！先花它`
        : `✅ ${name}: 余额 ${beans} 豆(¥${val})，${days} 天内无过期`
    );
  }
  const now = new Date();
  const month = now.getMonth() + 1;
  let tip = '数据来源: 京东App权益中心(精确值)';
  if (month === 11 || month === 12) tip = '年底清豆期！常规京豆次年12/31过期, 尽快消耗将过期豆';
  const msg = lines.join('\n') + '\n\n' + tip;
  console.log('\n' + msg);
  $notify('京豆过期统计', accounts.length + ' 个账号', msg);
  $done();
})();
