# Quantumult X 京东脚本

## jd wskey 抓取
- 抓取 `api.m.jd.com` 请求里的 `pin` + `wskey`
- 自动推送到 ntfy 频道

### 订阅地址
```
https://raw.githubusercontent.com/xiaotaiye88/qx-jd-scripts/main/qx_jd_wskey.js
```

### 圈X 配置
- 类型: http-request
- URL: `^https?:\/\/api\.m\.jd\.com`
- MITM 主机名: `api.m.jd.com`
