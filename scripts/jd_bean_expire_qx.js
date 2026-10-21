/*
 * 京豆过期统计（Quantumult X 原生版）— 官方精确 + 逐日明细
 * cron: 23 10 1 * *   （每月1日 + 可随时手动跑）
 *
 * 数据源（2026-10 逆向京东 App 抓包验证）:
 *   1. 总额: POST api.m.jd.com/api?functionId=bff_rightsCenter_userInfo&scene=userInfo
 *      无需 h5st, 纯 pt_key cookie。返回 expireBeans(30天内过期总数)/expireDays/
 *      jingBeans(余额)/jingBeanValue(元)
 *   2. 逐日明细: GET pro.m.jd.com/mall/active/489nMDh5uCXJqx5B3VbQTKTz5bpr/index.html
 *      ("查看详情"浮窗的 SSR 页), 页面内嵌 expireTransactions 数组:
 *      [{num: 21, transactionTime: "2026-11-12 23:59:59"}, ...] 每天的过期数量
 *
 * 历史: queryexpirejingdou(旧接口)已下线; getJingBeanBalanceDetail 无过期字段。
 *       本方案 = 官方精确值。
 * Cookie 失效(F10002)时提示跑 CK检测 更新。
 */

const TIMEOUT = 20000;
const USERINFO_API = 'https://api.m.jd.com/api?functionId=bff_rightsCenter_userInfo&scene=userInfo';
const DETAIL_PAGE = 'https://pro.m.jd.com/mall/active/489nMDh5uCXJqx5B3VbQTKTz5bpr/index.html';
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

function fetchRaw(opts) {
  return new Promise(resolve => {
    $task.fetch({ timeout: TIMEOUT, ...opts }).then(
      resp => resolve(resp),
      err => resolve({ error: (err && err.message) || String(err) })
    );
  });
}

// 总额: 余额 + 30天过期总数
async function queryUserInfo(ck) {
  const body = 'appid=plus_business&functionId=bff_rightsCenter_userInfo&body='
    + encodeURIComponent(JSON.stringify({ scene: 'userInfo', contentType: '28_29' }))
    + '&loginType=2&loginWQBiz=&xAPIClientLanguage=zh_CN&scval=undefined&t=' + Date.now();
  const resp = await fetchRaw({
    url: USERINFO_API, method: 'POST',
    headers: {
      'Cookie': ck, 'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://pro.m.jd.com/mall/active/4E1fFrgX1eGtWTc5KBNFzXMrh6xn/index.html',
      'Origin': 'https://pro.m.jd.com',
    },
    body,
  });
  if (resp.error) return { err: '网络错误: ' + resp.error };
  try {
    if (resp.statusCode !== 200) return { err: 'HTTP ' + resp.statusCode };
    const j = JSON.parse(resp.body || '');
    if (j.code === '1711000' && j.rs) return { rs: j.rs };
    if (j.code === 'F10002') return { err: 'cookie失效(用户未登陆)' };
    return { err: 'code=' + j.code + ' ' + (j.msg || '') };
  } catch (e) { return { err: '解析失败: ' + e.message }; }
}

// 逐日明细: SSR 页面内嵌 expireTransactions
async function queryExpireDetail(ck) {
  const resp = await fetchRaw({
    url: DETAIL_PAGE, method: 'GET',
    headers: { 'Cookie': ck, 'User-Agent': UA },
  });
  if (resp.error) return { err: '网络错误: ' + resp.error };
  try {
    if (resp.statusCode !== 200) return { err: 'HTTP ' + resp.statusCode };
    const m = (resp.body || '').match(/"expireTransactions":\[([^\]]*)\]/);
    if (!m) return { err: '页面无过期数据(可能未登录或数据未出)' };
    const list = JSON.parse('[' + m[1] + ']')
      .map(it => ({ date: String(it.transactionTime || '').slice(5, 10), num: parseInt(it.num, 10) || 0 }))
      .filter(it => it.num > 0);
    return { list };
  } catch (e) { return { err: '解析失败: ' + e.message }; }
}

(async () => {
  const accounts = collectCookies();
  if (!accounts.length) {
    $notify('京豆过期统计', '❌ 未找到 Cookie', '请先在 BoxJs 配置 CookiesJD');
    $done();
    return;
  }
  console.log('京豆过期统计(精确+逐日明细): 共 ' + accounts.length + ' 个账号');
  const lines = [];
  for (const acc of accounts) {
    const pinRaw = (acc.pin.match(/pt_pin=([^;]+);?/) || [])[1] || '账号';
    const name = decodeURIComponent(pinRaw);
    const ui = await queryUserInfo(acc.cookie);
    if (ui.err) {
      console.log('[' + name + '] ❌ ' + ui.err);
      lines.push(`❌ ${name}: ${ui.err}${ui.err.includes('失效') ? '（跑CK检测更新）' : ''}`);
      continue;
    }
    const beans = parseInt(ui.rs.jingBeans, 10) || 0;
    const expTotal = parseInt(ui.rs.expireBeans, 10) || 0;
    const days = parseInt(ui.rs.expireDays, 10) || 0;
    const val = ui.rs.jingBeanValue || (beans / 100).toFixed(2);
    console.log(`[${name}] 余额${beans}豆, ${days}天内过期${expTotal}豆`);
    if (expTotal <= 0) {
      lines.push(`✅ ${name}: 余额 ${beans} 豆(¥${val})，${days} 天内无过期`);
      continue;
    }
    let msg = `⚠️ ${name}: 余额 ${beans} 豆(¥${val})，${days} 天内过期 ${expTotal} 豆`;
    const det = await queryExpireDetail(acc.cookie);
    if (det.err) {
      console.log('[' + name + '] 明细: ' + det.err);
      msg += '（明细获取失败: ' + det.err + '）';
    } else if (!det.list.length) {
      msg += '（无逐日明细）';
    } else {
      const sum = det.list.reduce((s, it) => s + it.num, 0);
      msg += '\n' + det.list.map(it => `  ${it.date} 过期 ${it.num} 豆`).join('\n');
      if (sum !== expTotal) msg += `\n  (明细合计 ${sum}，与总数 ${expTotal} 有出入)`;
    }
    lines.push(msg);
  }
  const now = new Date();
  const month = now.getMonth() + 1;
  let tip = '数据来源: 京东App权益中心(精确值)';
  if (month === 11 || month === 12) tip = '年底清豆期！尽快消耗将过期豆';
  const msg = lines.join('\n') + '\n\n' + tip;
  console.log('\n' + msg);
  $notify('京豆过期统计', accounts.length + ' 个账号', msg);
  $done();
})();
