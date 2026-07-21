/**************************
 * 京东 wskey 抓取 (Quantumult X)
 * 抓 api.m.jd.com 请求里的 pin + wskey
 *
 * 推送配置: 在 BoxJs 设置 JD_NTFY_TOPIC（如 "mytopic"），脚本会推送到 https://ntfy.sh/mytopic
 *          不配置则仅本地通知，不外推
 **************************/

// 从 BoxJs 读取 ntfy topic（不配置则不推送）
function getNtfyUrl() {
  try {
    if (typeof $prefs !== "undefined") {
      const topic = $prefs.valueForKey("JD_NTFY_TOPIC");
      if (topic && topic !== "false" && topic !== "") {
        return "https://ntfy.sh/" + topic.trim();
      }
    }
  } catch (_) {}
  return null;
}

try {
  const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";
  const pinM = cookie.match(/pin=([^;]+)/);
  const wskeyM = cookie.match(/wskey=([^;]+)/);

  if (wskeyM && wskeyM[1]) {
    const wskey = wskeyM[1];
    const pin = pinM ? pinM[1] : "unknown";
    const payload = `JDWSKEY pin=${pin};wskey=${wskey};`;

    // 去重：同一个 pin+wskey 只通知一次
    const key = `qxjd_${pin}_${wskey.substring(0, 16)}`;
    let alreadyNotified = false;
    if (typeof $persistentStore !== "undefined") {
      const last = $persistentStore.read(key);
      if (last) {
        alreadyNotified = true;
      } else {
        $persistentStore.write("1", key);
      }
    }

    if (!alreadyNotified) {
      const ntfyUrl = getNtfyUrl();
      if (ntfyUrl) {
        // 有配置 ntfy，推送
        $httpClient.post(
          {
            url: ntfyUrl,
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
      } else {
        // 无配置 ntfy，仅本地通知
        $notification.post(
          "✅ JD wskey 已抓取",
          "pin=" + pin,
          "wskey=" + wskey.substring(0, 30) + "..."
        );
      }
    }
  }
} catch (e) {
  $notification.post("JD抓取异常", "", String(e));
}

$done({});
