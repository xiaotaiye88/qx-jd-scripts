// ============================================================================
// QX Node 兼容层（prelude）
// 让青龙面板(Node.js)的京东脚本能在 Quantumult X 的 JavaScriptCore 环境运行。
// 提供：CommonJS require 注册表、process/path/Buffer 垫片、
//       got/axios 子集（基于 $task.fetch）、https/proxy 等桩模块。
// ============================================================================

var __QX_G = (typeof globalThis !== 'undefined') ? globalThis : this;

// ---------- CommonJS 模块注册表 ----------
var __qxModules = {};    // name -> 已加载的 exports
var __qxFactories = {};  // name -> 惰性工厂函数

function __qxDefine(name, factory) { __qxFactories[name] = factory; }

// 宽松桩：对不确定用途的模块（诱饵 require、代理类等），
// 任何属性访问都返回空函数，new 调用返回空对象，并打日志便于排查。
function __qxPermissiveStub(name) {
  var stubFn = function () {
    console.log('[qx-shim] 调用了桩模块 ' + name + ' 的函数');
    return undefined;
  };
  return new Proxy(stubFn, {
    get: function (t, k) {
      if (k === 'prototype') return {};
      if (k === Symbol.toPrimitive) return function () { return ''; };
      console.log('[qx-shim] 访问桩模块 ' + name + '.' + String(k));
      return function () { return undefined; };
    },
    construct: function () {
      console.log('[qx-shim] new 了桩模块 ' + name);
      return {};
    },
    apply: function () {
      console.log('[qx-shim] 调用了桩模块 ' + name);
      return undefined;
    }
  });
}

function require(name) {
  if (name in __qxModules) return __qxModules[name];
  // 规范化: 去掉末尾 .js 再试
  if (!(name in __qxFactories) && name.endsWith('.js')) {
    var bare = name.slice(0, -3);
    if (bare in __qxFactories) name = bare;
  }
  if (__qxFactories[name]) {
    var f = __qxFactories[name];
    delete __qxFactories[name];
    __qxModules[name] = f();
    return __qxModules[name];
  }
  console.log('[qx-shim] 未注册的 require: ' + name + '（已用宽松桩代替）');
  __qxModules[name] = __qxPermissiveStub(name);
  return __qxModules[name];
}

// ---------- process 垫片 ----------
// env 默认为空，脚本内置默认值会生效；可通过 BoxJs 键 JD_ENV_JSON（JSON 对象）注入环境变量。
var process = (function () {
  var env = {};
  try {
    if (typeof $prefs !== 'undefined') {
      var raw = $prefs.valueForKey('JD_ENV_JSON');
      if (raw) {
        var extra = JSON.parse(raw);
        for (var k in extra) env[k] = String(extra[k]);
      }
    }
  } catch (e) { console.log('[qx-shim] JD_ENV_JSON 解析失败: ' + e); }
  return {
    env: env,
    argv: ['quantumultx', 'jd_dwapp.js'],
    mainModule: { filename: 'jd_dwapp.js' },
    cwd: function () { return '/'; },
    exit: function (code) { console.log('[qx-shim] process.exit(' + code + ')'); },
    nextTick: function (fn) { return Promise.resolve().then(fn); }
  };
})();

// ---------- path 垫片（posix 风格子集） ----------
__qxDefine('path', function () {
  function normalize(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || p === '.') continue;
      if (p === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else out.push(p); }
      else out.push(p);
    }
    return out;
  }
  function join() {
    var segs = [];
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i] || '');
      if (s) segs.push.apply(segs, s.split(/[\\/]+/));
    }
    var abs = String(arguments[0] || '').charAt(0) === '/';
    return (abs ? '/' : '') + normalize(segs).join('/');
  }
  function normalizePath(p) {
    var abs = String(p).charAt(0) === '/';
    var r = normalize(String(p).split(/[\\/]+/)).join('/');
    return (abs ? '/' : '') + r || (abs ? '/' : '.');
  }
  return {
    join: join,
    resolve: function () { var r = join.apply(null, arguments); return r.charAt(0) === '/' ? r : '/' + r; },
    normalize: normalizePath,
    relative: function (from, to) {
      var f = normalize(String(from).split(/[\\/]+/));
      var t = normalize(String(to).split(/[\\/]+/));
      var i = 0;
      while (i < f.length && i < t.length && f[i] === t[i]) i++;
      var out = [];
      for (var j = i; j < f.length; j++) out.push('..');
      for (var j = i; j < t.length; j++) out.push(t[j]);
      return out.join('/');
    },
    parse: function (p) {
      p = String(p);
      var dir = '', base = p, root = '';
      if (p.charAt(0) === '/') root = '/';
      var li = p.replace(/\\/g, '/').lastIndexOf('/');
      if (li >= 0) { dir = p.slice(0, li) || '/'; base = p.slice(li + 1); }
      var ei = base.lastIndexOf('.');
      return { root: root, dir: dir, base: base, ext: ei > 0 ? base.slice(ei) : '', name: ei > 0 ? base.slice(0, ei) : base };
    },
    format: function (obj) {
      var dir = obj.dir || (obj.root || '');
      var base = obj.base || ((obj.name || '') + (obj.ext || ''));
      return dir ? dir + (dir.charAt(dir.length - 1) === '/' ? '' : '/') + base : base;
    },
    basename: function (p, ext) {
      var b = String(p).split(/[\\/]+/).pop() || '';
      return (ext && b.slice(-ext.length) === ext) ? b.slice(0, -ext.length) : b;
    },
    dirname: function (p) {
      var parts = String(p).split(/[\\/]+/); parts.pop();
      return parts.join('/') || '/';
    },
    extname: function (p) {
      var b = String(p).split(/[\\/]+/).pop() || '';
      var i = b.lastIndexOf('.');
      return i > 0 ? b.slice(i) : '';
    },
    sep: '/',
    delimiter: ':',
    isAbsolute: function (p) { return String(p).charAt(0) === '/'; }
  };
});

// ---------- Buffer 最小垫片（utf8 / hex / base64） ----------
if (typeof __QX_G.Buffer === 'undefined') {
  (function () {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function utf8Bytes(s) {
      var out = [];
      s = unescape(encodeURIComponent(String(s)));
      for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
      return out;
    }
    function bytesToUtf8(bytes) {
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return decodeURIComponent(escape(s));
    }
    function bytesToHex(bytes) {
      var h = '';
      for (var i = 0; i < bytes.length; i++) h += ('0' + bytes[i].toString(16)).slice(-2);
      return h;
    }
    function hexToBytes(hex) {
      var out = [];
      hex = String(hex).replace(/[^0-9a-fA-F]/g, '');
      for (var i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
      return out;
    }
    function bytesToB64(bytes) {
      var out = '', i;
      for (i = 0; i + 2 < bytes.length; i += 3) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
      }
      var rem = bytes.length - i;
      if (rem === 1) {
        var n1 = bytes[i] << 16;
        out += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63] + '==';
      } else if (rem === 2) {
        var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63] + '=';
      }
      return out;
    }
    function b64ToBytes(b64) {
      var out = [];
      b64 = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
      for (var i = 0; i + 3 < b64.length + 1; i += 4) {
        var c = [B64.indexOf(b64[i]), B64.indexOf(b64[i + 1]), B64.indexOf(b64[i + 2]), B64.indexOf(b64[i + 3])];
        if (c[0] < 0 || c[1] < 0) break;
        var n = (c[0] << 18) | (c[1] << 12) | ((c[2] < 0 ? 0 : c[2]) << 6) | (c[3] < 0 ? 0 : c[3]);
        out.push((n >> 16) & 255);
        if (c[2] >= 0) out.push((n >> 8) & 255);
        if (c[3] >= 0) out.push(n & 255);
      }
      return out;
    }
    function makeBuf(bytes) {
      return {
        _b: bytes,
        length: bytes.length,
        toString: function (enc) {
          enc = (enc || 'utf8').toLowerCase();
          if (enc === 'hex') return bytesToHex(bytes);
          if (enc === 'base64') return bytesToB64(bytes);
          if (enc === 'utf8' || enc === 'utf-8' || enc === 'binary' || enc === 'latin1') return bytesToUtf8(bytes);
          return bytesToUtf8(bytes);
        },
        toJSON: function () { return { type: 'Buffer', data: bytes.slice() }; }
      };
    }
    __QX_G.Buffer = {
      from: function (data, enc) {
        if (typeof data === 'string') {
          enc = (enc || 'utf8').toLowerCase();
          if (enc === 'hex') return makeBuf(hexToBytes(data));
          if (enc === 'base64') return makeBuf(b64ToBytes(data));
          return makeBuf(utf8Bytes(data));
        }
        if (data && data._b) return makeBuf(data._b.slice());
        if (Object.prototype.toString.call(data) === '[object Array]') return makeBuf(data.slice());
        return makeBuf([]);
      },
      alloc: function (n, fill) {
        var b = [];
        for (var i = 0; i < n; i++) b.push(fill || 0);
        return makeBuf(b);
      },
      concat: function (list) {
        var b = [];
        for (var i = 0; i < list.length; i++) b.push.apply(b, list[i]._b || []);
        return makeBuf(b);
      },
      isBuffer: function (o) { return !!(o && o._b); },
      byteLength: function (s) { return utf8Bytes(s).length; }
    };
  })();
}
// 确保 Buffer 在全局和局部都可见
var Buffer = __QX_G.Buffer;

// ---------- $task.fetch 适配：把响应包装成类 Node 形态 ----------
function __qxFetch(reqOpts) {
  return new Promise(function (resolve, reject) {
    if (typeof $task === 'undefined' || !$task.fetch) {
      reject(new Error('当前环境无 $task.fetch（非 Quantumult X 任务环境）'));
      return;
    }
    var o = {
      url: reqOpts.url,
      method: (reqOpts.method || 'GET').toUpperCase(),
      headers: reqOpts.headers || {}
    };
    if (reqOpts.body !== undefined && reqOpts.body !== null) o.body = String(reqOpts.body);
    if (reqOpts.timeout) o.timeout = reqOpts.timeout;
    $task.fetch(o).then(function (resp) {
      resolve({
        statusCode: resp.statusCode || resp.status || 0,
        headers: resp.headers || {},
        body: resp.body !== undefined ? resp.body : '',
        url: o.url
      });
    }, function (err) {
      reject(new Error((err && err.error) ? err.error : String(err)));
    });
  });
}

// ---------- got 子集垫片 ----------
__qxDefine('got', function () {
  function got(url, opts) {
    if (typeof url === 'object' && url !== null) { opts = url; url = opts.url; }
    opts = opts || {};
    var headers = {};
    for (var k in (opts.headers || {})) headers[k.toLowerCase()] = opts.headers[k];
    var reqUrl = url;
    if (opts.searchParams) {
      var sp = [];
      var params = typeof opts.searchParams === 'string' ? opts.searchParams : opts.searchParams;
      if (typeof params === 'string') sp.push(params.replace(/^\?/, ''));
      else for (var sk in params) sp.push(encodeURIComponent(sk) + '=' + encodeURIComponent(params[sk]));
      reqUrl += (reqUrl.indexOf('?') >= 0 ? '&' : '?') + sp.join('&');
    }
    var body;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    } else if (opts.form !== undefined) {
      var fp = [];
      for (var fk in opts.form) fp.push(encodeURIComponent(fk) + '=' + encodeURIComponent(opts.form[fk]));
      body = fp.join('&');
      if (!headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (opts.body !== undefined) {
      body = typeof opts.body === 'string' ? opts.body : (opts.body && opts.body._b ? opts.body.toString() : String(opts.body));
    }
    if (opts.cookieJar) console.log('[qx-shim] got: cookieJar 被忽略（QX 由系统管理 Cookie）');
    return __qxFetch({
      url: reqUrl,
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      timeout: opts.timeout ? (typeof opts.timeout === 'object' ? opts.timeout.request : opts.timeout) : undefined
    }).then(function (resp) {
      if (opts.responseType === 'json' || opts.resolveBodyOnly) {
        try { resp.body = JSON.parse(resp.body); } catch (e) { /* 保留原文 */ }
      }
      return resp;
    });
  }
  ['get', 'post', 'put', 'patch', 'delete', 'head'].forEach(function (m) {
    got[m] = function (url, opts) {
      opts = opts || {}; opts.method = m.toUpperCase();
      return got(url, opts);
    };
  });
  got.extend = function (defaults) {
    defaults = defaults || {};
    var extended = function (url, opts) {
      var merged = { headers: Object.assign({}, defaults.headers, (opts && opts.headers) || {}) };
      if (defaults.prefixUrl && typeof url === 'string' && url.indexOf('http') !== 0) url = defaults.prefixUrl + url;
      return got(url, Object.assign({}, defaults, opts || {}, merged));
    };
    ['get', 'post', 'put', 'patch', 'delete', 'head'].forEach(function (m) {
      extended[m] = function (url, opts) { opts = opts || {}; opts.method = m.toUpperCase(); return extended(url, opts); };
    });
    extended.extend = got.extend;
    return extended;
  };
  return got;
});

// ---------- axios 子集垫片 ----------
__qxDefine('axios', function () {
  function toAxiosResp(resp) {
    var data = resp.body;
    try { data = JSON.parse(resp.body); } catch (e) { /* 非 JSON 保留字符串 */ }
    return { data: data, status: resp.statusCode, statusText: '', headers: resp.headers, config: {} };
  }
  function axios(config) {
    if (typeof config === 'string') config = { url: config };
    config = config || {};
    var url = config.url;
    if (config.params) {
      var sp = [];
      for (var k in config.params) sp.push(encodeURIComponent(k) + '=' + encodeURIComponent(config.params[k]));
      url += (url.indexOf('?') >= 0 ? '&' : '?') + sp.join('&');
    }
    return __qxFetch({
      url: url,
      method: config.method || 'GET',
      headers: config.headers || {},
      body: config.data !== undefined ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : undefined,
      timeout: config.timeout
    }).then(toAxiosResp);
  }
  axios.get = function (u, c) { c = c || {}; c.url = u; c.method = 'GET'; return axios(c); };
  axios.post = function (u, data, c) { c = c || {}; c.url = u; c.method = 'POST'; c.data = data; return axios(c); };
  axios.put = function (u, data, c) { c = c || {}; c.url = u; c.method = 'PUT'; c.data = data; return axios(c); };
  axios.delete = function (u, c) { c = c || {}; c.url = u; c.method = 'DELETE'; return axios(c); };
  axios.create = function (defaults) {
    defaults = defaults || {};
    var inst = function (config) {
      config = config || {};
      var merged = Object.assign({}, defaults, config);
      merged.headers = Object.assign({}, defaults.headers || {}, config.headers || {});
      if (defaults.baseURL && config.url && config.url.indexOf('http') !== 0) merged.url = defaults.baseURL + config.url;
      return axios(merged);
    };
    inst.get = axios.get; inst.post = axios.post; inst.put = axios.put; inst.delete = axios.delete;
    inst.create = axios.create;
    inst.interceptors = { request: { use: function () {} }, response: { use: function () {} } };
    inst.defaults = defaults;
    return inst;
  };
  axios.interceptors = { request: { use: function () {} }, response: { use: function () {} } };
  axios.defaults = {};
  return axios;
});

// ---------- Node crypto 垫片（用 crypto-js 实现哈希/HMAC/随机数） ----------
__qxDefine('crypto', function () {
  var CryptoJS = require('crypto-js');
  var ALGO = { md5: 'MD5', sha1: 'SHA1', sha224: 'SHA224', sha256: 'SHA256', sha384: 'SHA384', sha512: 'SHA512', ripemd160: 'RIPEMD160' };
  function normAlg(a) { return ALGO[String(a).toLowerCase().replace(/[-_]/g, '')] || 'SHA256'; }
  function toWordArray(data, enc) {
    if (typeof data === 'string') {
      if (enc === 'hex') return CryptoJS.enc.Hex.parse(data);
      if (enc === 'base64') return CryptoJS.enc.Base64.parse(data);
      return CryptoJS.enc.Utf8.parse(data);
    }
    if (data && data._b) return CryptoJS.lib.WordArray.create(data._b);
    if (data && data.sigBytes !== undefined) return data; // 已是 WordArray
    return CryptoJS.lib.WordArray.create([]);
  }
  function formatOut(wa, enc) {
    if (enc === 'base64') return wa.toString(CryptoJS.enc.Base64);
    if (enc === 'utf8' || enc === 'utf-8') return wa.toString(CryptoJS.enc.Utf8);
    if (enc === 'latin1' || enc === 'binary') return wa.toString(CryptoJS.enc.Latin1);
    if (!enc) return __QX_G.Buffer.from(wa.toString(CryptoJS.enc.Hex), 'hex');
    return wa.toString(CryptoJS.enc.Hex);
  }
  function Hash(alg) { this._h = CryptoJS.algo[normAlg(alg)].create(); }
  Hash.prototype.update = function (data, enc) { this._h.update(toWordArray(data, enc)); return this; };
  Hash.prototype.digest = function (enc) { return formatOut(this._h.finalize(), enc); };
  function Hmac(alg, key) {
    this._alg = normAlg(alg);
    this._key = toWordArray(key, 'utf8');
    this._parts = [];
  }
  Hmac.prototype.update = function (data, enc) { this._parts.push(toWordArray(data, enc)); return this; };
  Hmac.prototype.digest = function (enc) {
    var msg = this._parts.length === 1 ? this._parts[0] : this._parts.reduce(function (a, b) { return a.concat(b); }, CryptoJS.lib.WordArray.create([]));
    return formatOut(CryptoJS['Hmac' + this._alg](msg, this._key), enc);
  };
  return {
    createHash: function (alg) { return new Hash(alg); },
    createHmac: function (alg, key) { return new Hmac(alg, key); },
    randomBytes: function (n) { return __QX_G.Buffer.from(CryptoJS.lib.WordArray.random(n).toString(CryptoJS.enc.Hex), 'hex'); },
    randomUUID: function () {
      var h = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
    },
    pbkdf2Sync: function (pw, salt, iter, keylen, digest) {
      var out = CryptoJS.PBKDF2(toWordArray(pw, 'utf8'), toWordArray(salt, 'utf8'), { keySize: keylen / 4, iterations: iter });
      return __QX_G.Buffer.from(out.toString(CryptoJS.enc.Hex), 'hex');
    },
    getHashes: function () { return Object.keys(ALGO); },
    createSign: function () { throw new Error('[qx-shim] crypto.createSign 不支持'); },
    createVerify: function () { throw new Error('[qx-shim] crypto.createVerify 不支持'); },
    createCipheriv: function () { throw new Error('[qx-shim] crypto.createCipheriv 不支持'); },
    createDecipheriv: function () { throw new Error('[qx-shim] crypto.createDecipheriv 不支持'); }
  };
});

// 全局 crypto（部分脚本不经过 require 直接用 crypto.randomUUID 等）
if (typeof __QX_G.crypto === 'undefined') {
  __QX_G.crypto = {
    getRandomValues: function (arr) {
      var rnd = require('crypto').randomBytes(arr.length || arr.byteLength)._b;
      for (var i = 0; i < rnd.length; i++) arr[i] = rnd[i];
      return arr;
    },
    randomUUID: function () { return require('crypto').randomUUID(); }
  };
}

// ---------- https 桩（Agent 可被 new，request 不支持） ----------
__qxDefine('https', function () {
  function Agent(opts) { this.options = opts || {}; }
  Agent.prototype.destroy = function () {};
  return {
    Agent: Agent,
    request: function () { throw new Error('[qx-shim] https.request 不支持，请走 $task.fetch'); },
    get: function () { throw new Error('[qx-shim] https.get 不支持，请走 $task.fetch'); },
    globalAgent: new Agent({})
  };
});

// ---------- https-proxy-agent 桩（QX 网络代理由系统配置负责） ----------
__qxDefine('https-proxy-agent', function () {
  function HttpsProxyAgent(opts) { this.proxy = opts; }
  return { HttpsProxyAgent: HttpsProxyAgent };
});

// ---------- fs 桩 ----------
__qxDefine('fs', function () {
  function nf(name) { return function () { console.log('[qx-shim] fs.' + name + ' 被调用（已忽略）'); return undefined; }; }
  return {
    readFileSync: function () { console.log('[qx-shim] fs.readFileSync 被调用（返回空串）'); return ''; },
    writeFileSync: nf('writeFileSync'),
    appendFileSync: nf('appendFileSync'),
    existsSync: function () { return false; },
    mkdirSync: nf('mkdirSync'),
    readdirSync: function () { return []; },
    statSync: function () { return { isFile: function () { return false; }, isDirectory: function () { return false; } }; },
    unlinkSync: nf('unlinkSync'),
    createReadStream: nf('createReadStream'),
    createWriteStream: nf('createWriteStream')
  };
});

// ---------- tough-cookie 桩（Env 的 Node 分支才用，QX 不触发） ----------
__qxDefine('tough-cookie', function () {
  function CookieJar() { this._s = {}; }
  CookieJar.prototype.setCookieSync = function () {};
  CookieJar.prototype.getCookieStringSync = function () { return ''; };
  CookieJar.prototype.setCookie = function (c, u, cb) { if (cb) cb(null); };
  CookieJar.prototype.getCookieString = function (u, cb) { if (cb) cb(null, ''); };
  return { CookieJar: CookieJar, Cookie: { parse: function (s) { return { key: '', value: '', toString: function () { return String(s); } }; } } };
});

// ---------- USER_AGENTS 桩（京东 App 常用 UA 列表） ----------
__qxDefine('./USER_AGENTS', function () {
  return [
    'jdapp;iPhone;11.0.4;14.3;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
    'jdapp;iPhone;11.0.4;15.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
    'jdapp;iPhone;11.0.4;13.5;Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
  ];
});

// ---------- 青龙专属模块桩 ----------
__qxDefine('./sendNotify', function () {
  return {
    sendNotify: function (title, text) {
      console.log('[qx-shim] sendNotify: ' + title + ' ' + String(text || '').slice(0, 200));
      if (typeof $notify !== 'undefined') $notify(title, '', String(text || '').slice(0, 800));
      return Promise.resolve();
    }
  };
});

__qxDefine('./jdCookie.js', function () {
  // QX 下脚本走自身的 else 分支从 BoxJs 读 Cookie，此模块不会被加载；防御性提供。
  return {};
});

__qxDefine('./function/proxy.js', function () {
  // 青龙的代理池模块；QX 单机单账号无需代理池，网络代理由 QX 系统配置承担。
  function ProxyStub() { return {}; }
  ProxyStub.get = function () { return undefined; };
  return ProxyStub;
});

// ---------- 其他全局兼容 ----------
if (typeof __QX_G.global === 'undefined') __QX_G.global = __QX_G;
// 跨平台模板遗留全局：脚本 QX 分支里用 jsonformat/jsonFormat(str||"[]") 解析 BoxJs 的 JSON 值，等价 JSON.parse
if (typeof __QX_G.jsonformat === 'undefined') {
  __QX_G.jsonformat = function (s) { return JSON.parse(String(s || '[]')); };
  __QX_G.jsonFormat = __QX_G.jsonformat;  // 兼容大小写
}
var __dirname = '/';
var __filename = 'jd_dwapp.js';

console.log('[qx-shim] Quantumult X 兼容层已加载');
