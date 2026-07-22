#!/usr/bin/env python3
"""
wskey -> pt_key 本地转换工具
用法:
  python3 tools/ws_convert.py "wskey=xxx;pin=yyy;"        单条转换
  python3 tools/ws_convert.py --all                        转换青龙上全部 JD_WSCK
  python3 tools/ws_convert.py --ql "http://192.168.0.235:5700" "token" --all
"""
import sys, io, os, time, json as jmod, re, hashlib, base64, urllib.parse, random, uuid, urllib3
urllib3.disable_warnings()
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests

# ====== 京东签名算法 ======
def _rs(n): return ''.join(str(uuid.uuid4()).split('-'))
def _bE(s): return base64.b64encode(s.encode()).decode().translate(str.maketrans("KLMNOPQRSTABCDEFGHIJUVWXYZabcdopqrstuvwxefghijklmnyz0123456789+/","ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"))
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

PROXY = os.environ.get("WSKEY_PROXY", "")
PROXIES = {"http": PROXY, "https": PROXY} if PROXY else None
UA = "jdapp;android;11.2.8;10.0.4;network/wifi"

def convert_wskey(wskey_str, proxy=None):
    """转换一条 wskey，返回 (pt_key完整值, pin) 或 None"""
    proxies = {"http": proxy, "https": proxy} if proxy else PROXIES
    sign = _gs("genToken", {"url": "https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html"})
    try:
        r = requests.post("http://api.m.jd.com/client.action?functionId=genToken&"+sign,
            data="body="+urllib.parse.quote(jmod.dumps({"to":"https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html"})),
            headers={"Cookie": wskey_str, "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;"},
            timeout=15, verify=False, proxies=proxies)
        j = r.json()
        token = j.get('tokenKey', '')
        if not token or token == "xxx":
            return None, "genToken失败"
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
            return ("pt_key=%s;pt_pin=%s;" % (k, p)), p
        # 从 Set-Cookie 头提取
        mk = re.search(r'pt_key=([^;]+)', sc)
        mp = re.search(r'pt_pin=([^;]+)', sc)
        if mk and mp and 'fake_' not in mk.group(1):
            return ("pt_key=%s;pt_pin=%s;" % (mk.group(1), mp.group(1))), mp.group(1)
        return None, "过期/失败"
    except Exception as e:
        return None, str(e)[:60]

# 如果直接运行
if __name__ == "__main__":
    if "--all" in sys.argv:
        # 从青龙读取所有 JD_WSCK
        try:
            idx = sys.argv.index("--ql")
            ql_base = sys.argv[idx+1]
            ql_token = sys.argv[idx+2]
        except:
            print("需指定 --ql <url> <token>")
            sys.exit(1)
        hdr = {"Authorization": "Bearer " + ql_token}
        r = requests.get(ql_base + "/open/envs?searchValue=JD_WSCK", headers=hdr, timeout=10)
        data = r.json().get('data', {})
        items = data.get('data', []) if isinstance(data, dict) else data
        if not items:
            print("青龙上没有 JD_WSCK")
            sys.exit(0)
        proxy = os.environ.get("WSKEY_PROXY", "")
        print("共 %d 条 JD_WSCK，代理: %s\n" % (len(items), proxy or "无"))
        ok, fail = 0, 0
        for item in items:
            ws = item['value']
            pin = (re.search(r'pin=([^;]+)', ws) or [None, '?']).group(1)
            print("  [%s] 转换中..." % pin, end=' ', flush=True)
            result, info = convert_wskey(ws, proxy)
            if result:
                print("OK pt_key=%s..." % result.split(';')[0][8:28], end=' ')
                # 更新到青龙 JD_COOKIE
                # 先找到对应的 JD_COOKIE
                r2 = requests.get(ql_base + "/open/envs?searchValue=" + pin, headers=hdr, timeout=10)
                items2 = r2.json().get('data', {}).get('data', []) if isinstance(r2.json().get('data'), dict) else r2.json().get('data', [])
                updated = False
                for item2 in items2:
                    if 'JD_COOKIE' in item2.get('name','') and pin in item2.get('value',''):
                        eid = item2['id']
                        # 删除旧的
                        requests.delete(ql_base + "/open/envs", headers=hdr, json=[eid], timeout=10)
                        # 新建
                        remark = item2.get('remarks', '')
                        rr = requests.post(ql_base + "/open/envs", headers=hdr,
                            json=[{"name":"JD_COOKIE","value":result,"remarks":remark}], timeout=10)
                        if rr.json().get('code') == 200:
                            print("青龙已更新", end='')
                            updated = True
                        break
                if not updated:
                    print("未找到 JD_COOKIE", end='')
                ok += 1
            else:
                print("FAIL " + info, end='')
                fail += 1
            print()
        print("\n成功 %d, 失败 %d" % (ok, fail))
    elif len(sys.argv) >= 2:
        ws = sys.argv[1]
        pin = (re.search(r'pin=([^;]+)', ws) or [None, '?']).group(1)
        print("转换 %s ..." % pin)
        result, info = convert_wskey(ws)
        if result:
            print("OK " + result)
        else:
            print("FAIL " + info)
    else:
        print("用法:")
        print("  python3 tools/ws_convert.py \"wskey=xxx;pin=yyy;\"")
        print("  WSKEY_PROXY=http://192.168.0.235:7890 python3 tools/ws_convert.py --ql http://192.168.0.235:5700 TOKEN --all")
