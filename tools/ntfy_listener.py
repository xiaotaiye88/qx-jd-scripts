#!/usr/bin/env python3
"""
ntfy 监听器 → 自动更新青龙 JD_COOKIE
监听同一个 ntfy topic，cookie 直接入库，wskey 本地转换后入库

用法:
  python3 tools/ntfy_listener.py              # 一次性处理（处理最新消息后退��）
  python3 tools/ntfy_listener.py --listen     # 持续监听模式
  python3 tools/ntfy_listener.py --since=1h   # 处理最近1小时的消息
"""
import sys, io, os, time, json as jmod, re, hashlib, base64, urllib.parse, random, uuid, urllib3, argparse
urllib3.disable_warnings()
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests

# ====== 配置 ======
NTFY_TOPIC = "HzjHy2codes"
NTFY_BASE = "https://ntfy.sh"
QL_BASE = "http://192.168.0.235:5700"
QL_TOKEN = "248be614-ef2e-482b-82c4-da1833332ae8"
PROXY = os.environ.get("WSKEY_PROXY", "http://192.168.0.235:7890")
STATE_FILE = os.path.join(os.path.dirname(__file__), '..', '.ntfy_last_id')

# ====== 京东签名算法 ======
def _rs(n): return ''.join(str(uuid.uuid4()).split('-'))
def _bE(s): return base64.b64encode(s.encode()).decode().translate(str.maketrans(
    "KLMNOPQRSTABCDEFGHIJUVWXYZabcdopqrstuvwxefghijklmnyz0123456789+/",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"))
def _sc(inarg):
    k=b'80306f4370b39fd5630ad0529f77adb6';m=[0x37,0x92,0x44,0x68,0xA5,0x3D,0xCC,0x7F,0xBB,0xF,0xD9,0x88,0xEE,0x9A,0xE9,0x5A]
    a=[0]*len(inarg)
    for i in range(len(inarg)):
        r0=inarg[i];r2=m[i&0xf];r4=k[i&7];r0=r2^r0;r0=r0^r4;r0=r0+r2;r2=r2^r0;r1=k[i&7];r2=r2^r1;a[i]=r2&0xff
    return bytes(a)
def _ge():
    u=_rs(16);t=str(int(time.time()*1000));bu=_bE(u)
    ar=_bE('%s_%s_%s_%s'%(random.randint(1,10000),random.randint(1,10000),random.randint(1,10000),random.randint(1,10000)))
    dm=_bE(random.choice(['Mi11Ultra','Mi11','Mi10']))
    ep='{"hdid":"JM9F1ywUPwflvMIpYPok0tt5k9kW4ArJEU3lfLhxBqw=","ts":%s,"ridx":-1,"cipher":{"area":"%s","d_model":"%s","wifiBssid":"dW5hbw93bq==","osVersion":"CJS=","d_brand":"WQvrb21f","screen":"CtS1DIenCNqm","uuid":"%s","aid":"%s","openudid":"%s"},"ciphertype":5,"version":"1.2.0","appname":"com.jingdong.app.mall"}'%(int(t)-random.randint(100,1000),ar,dm,bu,bu,bu)
    return ep,u,t
def _gs(fid,body):
    if isinstance(body,dict):body=jmod.dumps(body)
    ep,suid,st=_ge();sv=random.choice(["102","111","120"])
    ag="functionId=%s&body=%s&uuid=%s&client=%s&clientVersion=%s&st=%s&sv=%s"%(fid,body,suid,"android","11.2.8",st,sv)
    s=hashlib.md5(base64.b64encode(_sc(ag.encode()))).hexdigest()
    return 'body=%s&clientVersion=%s&client=%s&sdkVersion=31&lang=zh_CN&harmonyOs=0&networkType=wifi&oaid=%s&ef=1&ep=%s&st=%s&sign=%s&sv=%s'%(urllib.parse.quote(body),"11.2.8","android",suid,urllib.parse.quote(ep),st,s,sv)

# ====== 核心函数 ======
UA = "jdapp;android;11.2.8;10.0.4;network/wifi"
QL_HDR = {"Authorization": "Bearer " + QL_TOKEN}

def log(msg):
    t = time.strftime("%H:%M:%S")
    print(f"[{t}] {msg}", flush=True)

def read_last_id():
    """读取最后一次处理的消息 ID"""
    try:
        with open(STATE_FILE, 'r') as f:
            return f.read().strip()
    except:
        return ""

def write_last_id(msg_id):
    """保存最后处理的消息 ID"""
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            f.write(msg_id)
    except:
        pass

def fetch_messages(since=None):
    """从 ntfy 获取消息"""
    url = f"{NTFY_BASE}/{NTFY_TOPIC}/json"
    params = {}
    if since:
        params['since'] = since
    try:
        r = requests.get(url, params=params, timeout=30, stream=True)
        return r
    except Exception as e:
        log(f"ntfy 请求失败: {e}")
        return None

def parse_ntfy_line(line):
    """解析 ntfy SSE 行"""
    line = line.strip()
    if not line or line.startswith(':'):
        return None
    if line.startswith('data: '):
        try:
            return jmod.loads(line[6:])
        except:
            return None
    return None

def extract_pin(text):
    """从文本中提取 pin"""
    m = re.search(r'(?:pt_pin|pin)=([^;]+)', text)
    return m.group(1) if m else ''

def extract_wskey(text):
    """从文本中提取 wskey 完整值"""
    pin = extract_pin(text)
    ws_match = re.search(r'wskey=([^;]+)', text)
    if not ws_match:
        return None
    return f"wskey={ws_match.group(1)};pin={pin};"

def convert_wskey(wskey_str):
    """转换 wskey → pt_key"""
    proxies = {"http": PROXY, "https": PROXY} if PROXY else None
    sign = _gs("genToken", {"url": "https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html"})
    try:
        r = requests.post("http://api.m.jd.com/client.action?functionId=genToken&"+sign,
            data="body="+urllib.parse.quote(jmod.dumps({"to":"https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html"})),
            headers={"Cookie": wskey_str, "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;"},
            timeout=15, verify=False, proxies=proxies)
        j = r.json()
        token = j.get('tokenKey', '')
        if not token or token == "xxx":
            return None
        r2 = requests.get("https://un.m.jd.com/cgi-bin/app/appjmp",
            params={'tokenKey': token, 'to': 'https://plogin.m.jd.com/cgi-bin/m/thirdapp_auth_page',
                    'client_type': 'android', 'appid': 879, 'appup_type': 1},
            headers={"Cookie": wskey_str, "User-Agent": UA},
            timeout=15, verify=False, allow_redirects=False, proxies=proxies)
        ck = r2.cookies.get_dict()
        sc = r2.headers.get('Set-Cookie', '')
        k = ck.get('pt_key', '')
        p = ck.get('pt_pin', '')
        if k and p and 'fake_' not in k:
            return f"pt_key={k};pt_pin={p};"
        mk = re.search(r'pt_key=([^;]+)', sc)
        mp = re.search(r'pt_pin=([^;]+)', sc)
        if mk and mp and 'fake_' not in mk.group(1):
            return f"pt_key={mk.group(1)};pt_pin={mp.group(1)};"
        return None
    except:
        return None

def update_ql_jdcookie(pt_key_line):
    """更新青龙 JD_COOKIE"""
    pin = extract_pin(pt_key_line)
    if not pin:
        log(f"  无法提取 pin，跳过")
        return False
    # 查找青龙上对应 pin 的 JD_COOKIE
    try:
        r = requests.get(f"{QL_BASE}/open/envs?searchValue={pin}", headers=QL_HDR, timeout=10)
        data = r.json().get('data', {})
        items = data.get('data', []) if isinstance(data, dict) else data
        target = None
        for item in items:
            if 'JD_COOKIE' in item.get('name', '') and pin in item.get('value', ''):
                target = item
                break
        if not target:
            log(f"  青龙上未找到 {pin} 的 JD_COOKIE，跳过")
            return False
        eid = target['id']
        remark = target.get('remarks', pin)
        # 删除旧的
        requests.delete(f"{QL_BASE}/open/envs", headers=QL_HDR, json=[eid], timeout=10)
        # 新建
        rr = requests.post(f"{QL_BASE}/open/envs", headers=QL_HDR,
            json=[{"name": "JD_COOKIE", "value": pt_key_line, "remarks": remark}], timeout=10)
        if rr.json().get('code') == 200:
            log(f"  ✅ 青龙已更新 {pin}")
            return True
        else:
            log(f"  ❌ 青龙更新失败: {rr.text[:100]}")
            return False
    except Exception as e:
        log(f"  ❌ 青龙API异常: {e}")
        return False

def handle_message(msg):
    """处理一条 ntfy 消息"""
    event = msg.get('event', '')
    if event != 'message':
        return
    title = msg.get('title', '')
    body = msg.get('message', '')
    msg_id = msg.get('id', '')
    log(f"收到: {title}")

    if 'JD_cookie_' in title:
        # Cookie — 直接更新青龙
        pin = extract_pin(body)
        if pin:
            update_ql_jdcookie(body)
        else:
            log(f"  无法解析 cookie: {body[:50]}")
    elif 'JD_wskey_' in title or 'JDWSKEY' in title:
        # Wskey — 先转换再更新
        ws = extract_wskey(body)
        if not ws:
            log(f"  无法提取 wskey: {body[:50]}")
            return
        pin = extract_pin(ws)
        log(f"  转换 {pin}...")
        result = convert_wskey(ws)
        if result:
            log(f"  ✅ 转换成功")
            update_ql_jdcookie(result)
        else:
            log(f"  ❌ 转换失败（wskey 可能过期）")
    else:
        # 其他消息，尝试解析 cookie 格式
        if body and ('pt_key=' in body or 'pt_pin=' in body):
            update_ql_jdcookie(body)

    if msg_id:
        write_last_id(msg_id)

# ====== 主入口 ======
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ntfy → 青龙自动更新")
    parser.add_argument('--listen', action='store_true', help='持续监听模式')
    parser.add_argument('--since', default='1h', help='从多久前开始 (默认1h)')
    args = parser.parse_args()

    if args.listen:
        log(f"持续监听 ntfy.sh/{NTFY_TOPIC} ...")
        last_id = read_last_id()
        since = last_id if last_id else args.since
        log(f"从 {since} 开始监听")
        while True:
            try:
                resp = fetch_messages(since)
                if not resp:
                    time.sleep(30)
                    continue
                for line in resp.iter_lines(decode_unicode=True):
                    msg = parse_ntfy_line(line)
                    if msg:
                        handle_message(msg)
                        msg_id = msg.get('id', '')
                        if msg_id:
                            since = msg_id
            except KeyboardInterrupt:
                log("退出")
                break
            except Exception as e:
                log(f"异常: {e}, 30秒后重连...")
                time.sleep(30)
    else:
        # 一次性模式
        log(f"获取 ntfy.sh/{NTFY_TOPIC} 最近 {args.since} 的消息...")
        resp = fetch_messages(args.since)
        if not resp:
            sys.exit(1)
        count = 0
        try:
            data = resp.json()
            if isinstance(data, list):
                for msg in data:
                    handle_message(msg)
                    count += 1
            elif isinstance(data, dict):
                handle_message(data)
                count = 1
        except:
            # 如果是 SSE 流，只取第一条
            for line in resp.iter_lines(decode_unicode=True):
                msg = parse_ntfy_line(line)
                if msg:
                    handle_message(msg)
                    count += 1
        log(f"处理了 {count} 条消息")
