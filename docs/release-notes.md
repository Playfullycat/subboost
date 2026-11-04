# SubBoost v2.14.1

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 安全修复：反向代理后的客户端 IP 识别

此前 `TRUST_PROXY_HEADERS=true` 会优先信任 `CF-Connecting-IP`，并取 `X-Forwarded-For` 的第一项。常见的反向代理（包括 1Panel 默认的 OpenResty 配置和 Caddy）会原样转发客户端自带的 `CF-Connecting-IP`、并在 `X-Forwarded-For` 后追加地址，导致客户端可以伪造 IP，绕过按 IP 的登录次数限制（按用户名的限制不受影响）。

- `TRUST_PROXY_HEADERS=true`：只信任反向代理写入的 `X-Real-IP`，没有时取 `X-Forwarded-For` 的最后一项；不再信任 `CF-Connecting-IP`。
- 新增 `TRUST_PROXY_HEADERS=cloudflare`：前面还有 Cloudflare CDN 时使用，优先信任 `CF-Connecting-IP`（请只允许 Cloudflare 的 IP 访问源站）。

升级提示：在 Cloudflare CDN 之后并设置了 `TRUST_PROXY_HEADERS=true` 的部署，请改为 `cloudflare`；其他部署无需修改。执行 `docker compose pull && docker compose up -d` 即可升级。

### 文档

- 补充 `APP_URL` 在各种访问方式下的写法和填写规则。
- 新增「使用 1Panel 部署」分步教程，包括编排、仅本机端口、反向代理网站、HTTPS 和初始化链接。

## English

### Security fix: client IP detection behind reverse proxies

Previously `TRUST_PROXY_HEADERS=true` trusted `CF-Connecting-IP` first and took the first `X-Forwarded-For` entry. Common reverse proxies (including 1Panel's default OpenResty config and Caddy) forward a client-supplied `CF-Connecting-IP` and append to `X-Forwarded-For`, so clients could fake their IP and dodge the per-IP sign-in limit (the per-username limit was unaffected).

- `TRUST_PROXY_HEADERS=true`: only trusts the proxy-written `X-Real-IP`, otherwise the last `X-Forwarded-For` entry; `CF-Connecting-IP` is no longer trusted.
- New `TRUST_PROXY_HEADERS=cloudflare`: for origins behind Cloudflare's CDN; trusts `CF-Connecting-IP` first (only allow Cloudflare IPs to reach the origin).

Upgrade note: deployments behind Cloudflare's CDN with `TRUST_PROXY_HEADERS=true` should switch to `cloudflare`; others need no change. Upgrade with `docker compose pull && docker compose up -d`.

### Documentation

- Explain what `APP_URL` should be for each way of accessing SubBoost, and the rules for filling it in.
- Add a step-by-step "Deploy with 1Panel" guide covering the compose stack, a localhost-only port, the reverse proxy site, HTTPS, and the setup link.
