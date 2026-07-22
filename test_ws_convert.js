// jd_wskey_convert 纯函数测试（手动提取核心函数）
const fs = require('fs');
const src = fs.readFileSync('scripts/jd_wskey_convert.qx.js', 'utf8');

// 提取 MD5 和工具函数（从文件开头到 "// ============================== BoxJs 操作 ==============================" 之前）
const pureStart = src.indexOf('// ============================== MD5 实现');
const pureEnd = src.indexOf('// ============================== BoxJs 操作');
let pureSrc = src.substring(pureStart, pureEnd);

// 把 doNotify 和其他 QX 函数也删掉（它们可能在 MD5 部分之后）
pureSrc = pureSrc.replace(/function doNotify[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function httpGet[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function httpPost[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function genToken[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function appjmp[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function prefsRead[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function prefsWrite[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function loadWsList[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function updateCookie[\s\S]*?(?=\n\/\/)/g, '')
                 .replace(/function doNotify[\s\S]*?(?=\nvar|\nfunction|\n\/\/)/g, '');

eval(pureSrc);

// 测试
let pass = 0, fail = 0;
function check(name, actual, expected) {
  if (actual === expected) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + ': got=' + actual + ' expected=' + expected); fail++; }
}
function checkLen(name, val, minLen) {
  if (val && val.length >= minLen) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name + ': length=' + (val ? val.length : 0) + ' < ' + minLen); fail++; }
}

check('MD5(hello)', md5('hello'), '5d41402abc4b2a76b9719d911017c592');
check('bytesToBase64(Hello)', bytesToBase64([72, 101, 108, 108, 111]), 'SGVsbG8=');

const ep = getEp();
checkLen('getEp suid', ep.suid, 16);
checkLen('getEp ep', ep.ep, 50);
checkLen('getEp st', ep.st, 10);

const s = getSign('genToken', {url: 'https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html'});
checkLen('getSign output', s, 100);
if (s.indexOf('sign=') > 0) {
  const sv = s.match(/sign=([^&]+)/)[1];
  check('sign is MD5 (32 hex)', sv.length, 32);
} else { console.log('❌ sign= not found'); fail++; }

const ub = utf8ToBase64('Hello中国');
check('utf8ToBase64', ub, 'SGVsbG/kuK3lm70=');

const jb = jdBase64('test123');
checkLen('jdBase64', jb, 5);

const sc = signCore('functionId=genToken&body={}&uuid=test12345678abcdef&client=android&clientVersion=11.2.8&st=1234567890123&sv=102');
checkLen('signCore output', sc, 10);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
