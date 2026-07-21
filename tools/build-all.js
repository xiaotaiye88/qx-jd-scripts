// ============================================================================
// 批量打包：将 jdpro 全部任务脚本打包成 Quantumult X 单文件
// 用法: node tools/build-all.js [--full] [--filter=jd_farm]
//   --full  一次性打包全部；不加则仅打印待打包列表供确认
//   --filter=xxx  只打包名称包含 xxx 的脚本
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.upstream');
const OUT = path.join(ROOT, 'scripts');
const NOW = new Date().toISOString().replace('T', ' ').slice(0, 19);
const REPO = 'https://github.com/xiaotaiye88/qx-jd-scripts';

const FULL = process.argv.includes('--full');
const FILTER = process.argv.find(a => a.startsWith('--filter='));
const FILTER_VAL = FILTER ? FILTER.split('=')[1].toLowerCase() : '';

// 依赖模块（所有脚本共用同一套）
const DEP_MODULES = {
  './function/dylib':  'dylib.js',
  './dyland.js':       'dyland.js',
  './function/dylanx': 'dylanx.js',
  './function/dylans': 'dylans.js',
  'crypto-js':         'crypto-js.min.js',
  // 额外 sign 变体
  './function/dylanv': 'dylanv.js',
  './function/dylanw': 'dylanw.js',
  './function/dylany': 'dylany.js',
  './function/dylank': 'dylank.js',
  // moment 由 prelude 内置轻量垫片提供（不用 moment.min.js，避免 JSC locale 报错）
  // jdCommon（jd_dpqd_single.js 需要）
  './function/jdCommon': 'jdCommon.js',
};

// 按需选择: 扫描主脚本来确定它引用了哪些模块（加 .js 后缀一并匹配）
function requiredModules(scriptSrc) {
  const deps = new Set();
  for (const [k] of Object.entries(DEP_MODULES)) {
    if (scriptSrc.includes('require("' + k + '")') || scriptSrc.includes("require('" + k + "')") ||
        scriptSrc.includes('require("' + k + '.js")') || scriptSrc.includes("require('" + k + ".js')")) {
      deps.add(k);
    }
  }
  // 所有脚本都需要的基础三件套
  deps.add('./function/dylib');
  deps.add('./dyland.js');
  deps.add('crypto-js');
  // dylans/dylanx 几乎所有脚本都需要（扫描命中率高）
  if (scriptSrc.includes('dylans')) deps.add('./function/dylans');
  if (scriptSrc.includes('dylanx')) deps.add('./function/dylanx');
  return deps;
}

// 图标库: 58xinian/icon（京东专用，200+ 图标）
const ICON_BASE = 'https://raw.githubusercontent.com/58xinian/icon/master/';
const ICON_DEFAULT = ICON_BASE + 'jd.png';

// 按任务中文名/文件名关键词匹配图标
function iconFor(name, fileName) {
  const s = name + ' ' + fileName;
  // 顺序敏感：更具体的优先
  if (/农场|浇水|fruit|water|farmnew/.test(s)) return ICON_BASE + 'jdnc.png';         // 农场
  if (/种豆|plantBean/.test(s)) return ICON_BASE + 'jdzz.png';                         // 种豆
  if (/庄园|汪汪|joy/.test(s)) return ICON_BASE + 'jdcww.png';                         // 汪汪庄园
  if (/红包|redBag|RedBag|摇/.test(s)) return ICON_BASE + 'jd_redPacket.png';          // 红包
  if (/抽奖|转盘|盲盒|lottery|draw|抓抓|挖宝|竞拍|捕鱼|抽奖机/.test(s)) return ICON_BASE + 'jd_lotteryMachine.png'; // 抽奖
  if (/京豆|资产|领豆|刮京|礼品卡|bean_change|bean_info|ttgd|pkabeans/.test(s)) return ICON_BASE + 'jd_bean_home.png'; // 京豆
  if (/签到|sign/.test(s)) return ICON_BASE + 'jx_sign.png';                           // 签到
  if (/视频|video/.test(s)) return ICON_BASE + 'jd_watch.png';                         // 视频
  if (/话费|dwapp|现金|多投/.test(s)) return ICON_BASE + 'jd_cash.png';                     // 话费/现金
  if (/取关|删|unsubscribe|delLjq/.test(s)) return ICON_BASE + 'jd_unbind.png';        // 取关/清理（先于店铺判断）
  if (/店铺|购物车|价保|评价|晒单|大牌|dpqd|rmvcart|OnceApply|AutoEval|dplhb/.test(s)) return ICON_BASE + 'jd_shop.png'; // 店铺/购物
  if (/排行|投票|rank/.test(s)) return ICON_BASE + 'jd_rankingList.png';               // 排行榜
  if (/图书|book/.test(s)) return ICON_BASE + 'jd_bookshop.png';                       // 图书
  if (/健康|plus|mohe/.test(s)) return ICON_BASE + 'jd_health.png';                    // 健康/PLUS
  if (/京喜|xsjx|jingxi/.test(s)) return ICON_BASE + 'jingxi.png';                     // 京喜
  if (/超市|vu50/.test(s)) return ICON_BASE + 'jd_syj.png';                            // 超市卡
  return ICON_DEFAULT;
}

// 排除列表（青龙专属工具，不适合圈X 运行）
const SKIP = new Set([
  'jd_indeps.js',        // 青龙依赖安装
  'jd_proxy_check.js',   // 代理池检测
  'jd_code2url.js',      // 口令转链接（依赖第三方 nolan 服务，且为按需工具非定时任务）
  'jd_wxtoken_m.js',     // 微信 token 获取（需要 wx app）
  'jd_CheckCK.js',       // 通过青龙 API 管理 CK（ql.getEnvs/DisableCk），圈X 无对应接口；改用原生版 jd_ckcheck_qx.js
]);

// 原生圈X 脚本（手写，不打包，直接引用文件 URL）。会追加进三种订阅。
const NATIVE_SCRIPTS = [
  {
    file: 'jd_ckcheck_qx.js',
    name: 'CK检测',
    desc: '检测所有京东 Cookie 有效性，失效账号及时通知（圈X 原生版，替代青龙的 jd_CheckCK）',
    cron: '30 7 * * *',
  },
];

function readCached(name) {
  return fs.readFileSync(path.join(CACHE, name), 'utf8');
}

function wrapModule(requireName, source, dirname) {
  return `
// ===== module: ${requireName} =====
__qxDefine(${JSON.stringify(requireName)}, function () {
  var module = { exports: {} };
  var exports = module.exports;
  var __dirname = ${JSON.stringify(dirname)};
  var __filename = ${JSON.stringify(dirname + '/' + requireName.split('/').pop())};
${source}
  return module.exports;
});
`;
}

// 中文名来源优先级: new Env('名') > 入口：名 > 文件名
// 描述从头部注释的入口行 / 活动行 / 域名行提取
function extractMeta(fileName, source) {
  let name = '', desc = '', cron = '';

  // 1) 中文名: new Env('xxx') 最可靠，所有 Dylan 脚本都有
  const envMatch = source.match(/new\s+Env\(\s*['\"](.+?)['\"]\s*\)/);
  if (envMatch) name = envMatch[1].trim();

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].trim();
    // 2) 入口/活动名（作为 desc 补充，或 name 兜底）
    const nm = line.match(/^[/\*]*\s*(?:入口|活动入口|活动|cron)[：:]\s*(.+)/);
    if (nm) {
      const v = nm[1].replace(/[\*\t]/g, '').replace(/\.js.*$/, '').trim();
      if (v && !name) name = v;
      else if (v && !desc) desc = v;
    }
    // cron 格式一: "cron: M H D M W"
    const cr1 = line.match(/^cron:\s*(\d[\d\s,*/#@-]{4,})/i);
    if (cr1) { cron = cr1[1].trim(); continue; }
    // cron 格式二: "M H D M W jd_xxx.js"
    const cr2 = line.match(/^\s*(\d[\d\s,*/#@-]+?)\s+jd_/);
    if (cr2) { cron = cr2[1].trim(); continue; }
  }

  if (!name) name = fileName.replace(/\.js$/, '').replace(/^jd_/, '');
  if (!desc) desc = name;
  if (!cron) cron = '30 7 * * *';
  const fields = cron.split(/\s+/);
  if (fields.length !== 5) cron = '30 7 * * *';
  return { name, desc, cron, tag: name };
}

function buildOne(fileName) {
  const mainSrc = readCached(fileName);
  const meta = extractMeta(fileName, mainSrc);
  const safeTag = meta.tag.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 40);
  const outName = fileName.replace(/\.js$/, '.qx.js');
  const outPath = path.join(OUT, outName);
  const prelude = fs.readFileSync(path.join(ROOT, 'src', 'prelude.js'), 'utf8');
  const deps = requiredModules(mainSrc);

  const parts = [
    `/*
 * ${meta.name} (${fileName}) — QX 打包版
 * 上游: https://github.com/6dylan6/jdpro
 * 构建: ${NOW} 由 tools/build-all.js 自动生成
 * 仓库: ${REPO}
 *
 * cron: ${meta.cron}
 */`,
    '\n// ==================== prelude ====================',
    prelude,
  ];

  for (const [requireName, depFile] of Object.entries(DEP_MODULES)) {
    if (!deps.has(requireName)) continue;
    const src = readCached(depFile);
    const dirname = requireName.startsWith('./function/') ? '/function' : '/function';
    parts.push(wrapModule(requireName, src, dirname));
  }

  parts.push(`\nvar CryptoJS = require('crypto-js');`);

  parts.push(`
// ===== 主脚本: ${fileName}（立即执行） =====
(function () {
  var __dirname = '/';
  var __filename = '${fileName}';
${mainSrc}
})();
`);

  const bundle = parts.join('\n');
  fs.writeFileSync(outPath, bundle, 'utf8');
  return { ...meta, tag: safeTag, file: outName, size: Buffer.byteLength(bundle), cron: meta.cron, icon: iconFor(meta.name, fileName), ok: true };
}

function main() {
  const scriptList = JSON.parse(fs.readFileSync(path.join(CACHE, 'script_list.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });

  const results = [];
  for (const fileName of scriptList) {
    if (SKIP.has(fileName)) {
      console.log(`[skip] ${fileName} (青龙专属工具)`);
      results.push({ file: fileName, ok: false, skip: true });
      continue;
    }
    if (FILTER_VAL && !fileName.toLowerCase().includes(FILTER_VAL)) continue;

    try {
      const r = buildOne(fileName);
      results.push(r);
      console.log(`[ ok ] ${fileName} -> ${r.file}  ${(r.size / 1024).toFixed(0)}KB  cron=${r.cron}  "${r.name}"`);
    } catch (e) {
      console.error(`[fail] ${fileName}: ${e.message}`);
      results.push({ file: fileName, ok: false, error: e.message });
    }
  }

  // 汇总
  const ok = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  // 追加原生圈X 脚本（手写，不打包）
  const nativeResults = NATIVE_SCRIPTS.map(s => ({
    ...s,
    tag: s.name,
    file: s.file,
    size: 0,
    cron: s.cron,
    icon: iconFor(s.name, s.file),
    ok: true,
    native: true,
  }));
  const allScripts = ok.concat(nativeResults);
  console.log(`\n===== 打包结果: ${ok.length} 成功, ${failed.length} 跳过/失败, ${nativeResults.length} 原生 =====`);

  // 写 conf 文件
  generateConf(allScripts);
  // 写 tasks 画廊 JSON（圈X 标准任务订阅格式）
  generateTasks(allScripts);
  // 写 BoxJs JSON
  generateBoxJs(allScripts);

  if (failed.length) {
    console.log('\n失败详情:');
    failed.forEach(f => console.log('  ' + f.file + ': ' + (f.skip ? '已跳过' : f.error)));
  }

  return { ok: allScripts, failed };
}

function generateConf(scripts) {
  const lines = [
    '# 京东脚本全家桶 (Quantumult X 资源订阅)',
    '# 订阅: https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/jd_scripts.conf',
    '',
    '[rewrite_local]',
    '# 抓取 pt_key + pt_pin + wskey，每分钟同账号最多推1次',
    '^https?://api\\.m\\.jd\\.com/ url script-request-header https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/qx_jd_all.js',
    '',
    '[task_local]',
  ];

  for (const s of scripts) {
    const url = `https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/${s.file}`;
    const escName = s.name.replace(/,/g, '，');
    lines.push(`# ${escName}`);
    lines.push(`${s.cron} ${url}, tag=${escName}, img-url=${s.icon}, enabled=true`);
    lines.push('');
  }

  lines.push('[mitm]');
  lines.push('hostname = api.m.jd.com');

  fs.writeFileSync(path.join(ROOT, 'jd_scripts.conf'), lines.join('\n'), 'utf8');
  console.log('已生成 jd_scripts.conf (' + scripts.length + ' 个任务)');
}

function generateTasks(scripts) {
  const tasks = scripts.map(s => {
    const url = `https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/${s.file}`;
    const tag = s.name.replace(/,/g, '，');
    return `${s.cron} ${url}, tag=${tag}, img-url=${s.icon}, enabled=true`;
  });

  const json = {
    name: '京东脚本 - QX Task Gallery',
    description: '京东全家桶：54 个自动化脚本（签到/农场/牧场/种豆/抽奖/价保/话费等），上游 @6dylan6/jdpro，由 @xiaotaiye88 移植打包',
    raw: 'https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/tasks/qx-jd-tasks.json',
    task: tasks,
  };

  const dir = path.join(ROOT, 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qx-jd-tasks.json'), JSON.stringify(json, null, 2), 'utf8');
  console.log('已生成 tasks/qx-jd-tasks.json (' + tasks.length + ' 个任务)');
}

function generateBoxJs(scripts) {
  const settings = [
    { id: 'CookiesJD', name: '方式一：多账号 Cookie（推荐）', val: '[]', type: 'textarea', desc: 'JSON 数组，格式 [{"cookie":"pt_key=xxx;pt_pin=xxx;"}]。使用本仓库抓包重写时会自动维护此项。' },
    { id: 'CookieJD', name: '方式二：账号1 Cookie', val: '', type: 'textarea', desc: 'pt_key=xxx;pt_pin=xxx; 格式。勿与方式一混用。' },
    { id: 'CookieJD2', name: '方式二：账号2 Cookie', val: '', type: 'textarea', desc: '第二个账号（可选），格式同上。' },
    { id: 'JD_ENV_JSON', name: '高级：环境变量注入', val: '{}', type: 'textarea', desc: 'JSON 对象，注入为脚本的 process.env。仅高级用户。' },
    { id: 'JD_CKCHECK_AUTODEL', name: 'CK检测自动清理失效Cookie', val: 'true', type: 'boolean', desc: '开启后 CK检测 任务会把明确失效的 Cookie 从 BoxJs 中删除。全部账号失效时不删（防误删）。' },
  ];

  const apps = scripts.map(s => ({
    id: 'jd_' + s.tag,
    name: s.name,
    desc: `${s.desc}（${s.file}）\ncron: ${s.cron}`,
    icon: s.icon,
    repo: REPO,
    script: `https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/master/scripts/${s.file}`,
    keys: ['CookiesJD', 'CookieJD', 'CookieJD2', 'JD_ENV_JSON'],
    settings,
  }));

  const boxjs = {
    id: 'qxJdScripts',
    name: '京东脚本',
    author: '@xiaotaiye88',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/jd.png',
    repo: REPO,
    apps,
  };

  fs.writeFileSync(path.join(ROOT, 'boxjs', 'qx-jd.boxjs.json'), JSON.stringify(boxjs, null, 2), 'utf8');
  console.log('已生成 boxjs/qx-jd.boxjs.json (' + apps.length + ' 个 app)');
}

if (FULL) {
  main();
} else {
  // 预览模式：列出所有待打包脚本
  const scriptList = JSON.parse(fs.readFileSync(path.join(CACHE, 'script_list.json'), 'utf8'));
  console.log('待打包脚本 (' + scriptList.length + ' 个):\n');
  scriptList.forEach(f => {
    if (SKIP.has(f)) { console.log('  [skip] ' + f + ' (青龙专属)'); return; }
    const src = readCached(f);
    const meta = extractMeta(f, src);
    console.log(`  [    ] ${f}  cron=${meta.cron}  "${meta.name}"`);
  });
  console.log('\n💡 确认后运行 node tools/build-all.js --full 执行打包');
  console.log('   按需打包: node tools/build-all.js --full --filter=jd_farm');
}
