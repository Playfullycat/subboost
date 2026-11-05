<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="平台：Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.16.0-green.svg" alt="版本 2.16.0">
    <a href="https://github.com/Playfullycat/subboost/pkgs/container/subboost"><img src="https://img.shields.io/badge/image-GHCR-blue.svg" alt="GHCR 镜像"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-orange.svg" alt="AGPL-3.0"></a>
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** 是一个 **Clash / Mihomo 订阅转换、增强和管理** 工具。它把机场订阅和自建节点转换为优化后的聚合订阅，并定时自动更新；通过可视化界面一键配置 **链式代理、精确分流、防 DNS 泄露和多订阅聚合**。

本仓库是 [SubBoost/subboost](https://github.com/SubBoost/subboost) 的分支版本，在上游基础上主要增加了：

- **一个文件部署**：只需一个 `docker-compose.yml`，所有密钥首次启动时自动生成，无需安装脚本、无需手动填写配置。
- **国内直连优化**：国内域名规则前置、国内 IP 规则后置并解析域名，默认 DNS 国内外分流，规则集和 Geo 数据走国内可访问的镜像，解决开启代理后国内服务卡顿、打不开的问题。
- **备份与恢复**：后台一键导出 / 导入全部订阅、模板和设置，可加密，可跨实例迁移，导入后原订阅链接继续可用。

## 目录

- [功能亮点](#功能亮点)
- [界面展示](#界面展示)
- [快速部署](#快速部署)
- [配置说明](#配置说明)
  - [反向代理与 HTTPS](#反向代理与-https)
  - [使用 1Panel 部署](#使用-1panel-部署)
- [管理员账号](#管理员账号)
- [使用订阅](#使用订阅)
- [国内网络优化说明](#国内网络优化说明)
- [备份与恢复](#备份与恢复)
- [更新、回滚与卸载](#更新回滚与卸载)
- [常见问题](#常见问题)
- [开发说明](#开发说明)
- [开源许可](#开源许可)

## 功能亮点

- **订阅转换**：支持订阅链接、YAML 文件和节点链接等多种格式导入。
- **节点管理**：支持批量对节点重命名、删除或配置监听端口。
- **节点筛选**：可在分流组高级模式中按导入源、地区和自定义规则筛选节点。
- **链式代理**：一键可视化配置链式代理和 `中转代理组`。
- **精确分流**：内置 30 多个常用代理组和 2000 多条远程规则集供启用。
- **规则管理**：可修改规则顺序，供高级用户深度自定义。
- **防 DNS 泄露**：默认的 `基础和 DNS 配置` 国内外 DNS 严格分开，海外域名经代理解析。
- **自动刷新**：定时自动刷新订阅，刷新时可智能匹配节点。
- **备份与恢复**：导出 / 导入订阅、模板和设置，支持密码加密。

## 界面展示

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost 可视化配置界面" width="960">
</p>

## 快速部署

### 环境要求

- 一台 Linux 服务器（x86_64 或 arm64），建议 1 GB 以上内存。
- [Docker](https://docs.docker.com/engine/install/) 与 Docker Compose v2（`docker compose version` 能正常输出即可）。
- 一个空闲端口，默认 `3000`。
- 镜像默认通过镜像站 `hub.1991029.xyz` 拉取，国内服务器无需配置 Docker 加速也能下载。服务器能直连 ghcr.io 和 Docker Hub 时，可以改用官方地址，见 [可选配置项](#可选配置项) 中的 `SUBBOOST_IMAGE` 和 `POSTGRES_IMAGE`。

### 1. 下载配置文件

```bash
mkdir -p ~/subboost && cd ~/subboost
curl -fsSLO https://github.com/Playfullycat/subboost/releases/latest/download/docker-compose.yml
```

> 发布附件里的 `docker-compose.yml` 已锁定为对应版本的镜像。也可以直接使用仓库根目录的 [docker-compose.yml](./docker-compose.yml)，它默认使用 `latest` 镜像。

### 2. 设置访问地址 `APP_URL`

在同一目录新建 `.env` 文件，写入你**在浏览器地址栏里访问 SubBoost 的地址**：

```bash
cat > .env <<'EOF'
APP_URL=https://sub.example.com
EOF
```

`APP_URL` 决定订阅链接的地址，也决定登录 Cookie 是否只走 HTTPS。按你的访问方式填写：

| 访问方式 | `APP_URL` 写法 |
|---|---|
| 反向代理 + 域名 + HTTPS（1Panel、宝塔、Caddy、Nginx 等） | `https://sub.example.com` |
| 反向代理 + 域名，未开 HTTPS | `http://sub.example.com` |
| 直接用 IP 和端口访问 | `http://1.2.3.4:3000`（端口与 `SUBBOOST_PORT` 一致） |
| 只在本机使用 | 不用设置，默认 `http://localhost:3000` |

填写规则：

- 必须与浏览器里的地址**完全一致**：协议（`http` / `https`）、域名或 IP、端口都要对上；不要带路径和结尾的 `/`。
- 使用反向代理时，填写**对外的域名地址**，不要填反向代理里的 `http://127.0.0.1:3000`。
- 写成 `https://` 却用 `http://` 访问，登录会失败（浏览器不会发送安全 Cookie）。
- 以后修改 `APP_URL` 后执行 `docker compose up -d` 生效，后台显示的订阅链接会自动换成新地址；已经添加到客户端的旧链接，旧地址不能访问时需要重新复制。

**可选：自定义管理员账号密码**。不设置时用户名为 `admin`、密码自动生成（见下一步）；想自己指定的话，在 `.env` 中加上：

```bash
SUBBOOST_ADMIN_USERNAME=admin
SUBBOOST_ADMIN_PASSWORD='至少10位的密码'
```

- 密码至少 10 位。**在 `.env` 中用单引号包住整个密码**，这样 `$`、`#`、空格等字符都会原样保留；直接写在 `docker-compose.yml` 里时，`$` 要写成 `$$`，含 `#` 或空格时给整个值加双引号。否则 `$xxx` 会被 docker compose 当成变量替换掉，实际密码就和你填的不一样了（启动时会看到 `The "xxx" variable is not set` 警告）。
- 只在第一次启动、还没有管理员时生效，之后修改这两项不会改动已有账号；需要强制改成这里的账号密码时，见 [用 docker-compose 重置管理员](#用-docker-compose-重置管理员)。

使用 1Panel 部署请看 [使用 1Panel 部署](#使用-1panel-部署)。更多选项见 [配置说明](#配置说明)。

### 3. 启动

```bash
docker compose up -d
```

第一次启动时会自动完成：

1. `init` 容器生成数据库密码、`ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET` 和管理员初始密码，保存到 `subboost-secrets` 数据卷，然后退出（状态显示 `Exited (0)` 属于正常）。
2. `db`（PostgreSQL）初始化数据库。
3. `app` 执行数据库迁移、自动创建管理员账号，并启动网页服务。
4. `cron` 每 6 分钟检查一次需要自动更新的订阅，并每小时刷新一次规则库索引。

用 `docker compose ps` 查看状态，`app` 显示 `healthy` 即启动完成。

### 4. 登录

管理员账号已经自动创建好，账号密码（自动生成或自定义的都会）打印在日志里：

```bash
docker compose logs app | grep -E "Username|Password"
```

输出类似：

```text
app-1  | [subboost]   用户名 Username: admin
app-1  | [subboost]   密码   Password: 3f9c2a7d41e85b06c9d2e1f4
```

在浏览器打开 `APP_URL` 用这组账号密码登录，**登录后建议在「账户设置 → 修改密码」中换成自己的密码**。日志里打印的就是实际生效的密码，如果和你在 compose 中填的不一样，多半是 `$` 等字符被替换了。之后每次启动都会检查 compose 中的账号密码：一致时再次打印，不一致时会提示原因，见 [登录不上](#登录不上)。

### 5. 开始使用

登录后即可导入机场订阅或节点、选择分流规则并保存订阅，然后把生成的订阅链接添加到客户端，详见 [使用订阅](#使用订阅)。

## 配置说明

### 可选配置项

所有配置都可以写在 `docker-compose.yml` 同目录的 `.env` 文件中，修改后执行 `docker compose up -d` 生效。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | 浏览器和客户端访问 SubBoost 的地址，用于生成订阅链接。使用 `https://` 时登录 Cookie 只会通过 HTTPS 发送。 |
| `SUBBOOST_PORT` | `3000` | 服务器上对外暴露的端口。修改后记得同步修改 `APP_URL`。 |
| `TRUST_PROXY_HEADERS` | `false` | 按反向代理传来的客户端 IP 限制登录频率：放在反向代理之后设为 `true`；前面还有 Cloudflare CDN 时设为 `cloudflare`；直接暴露端口时保持 `false`。见 [反向代理与 HTTPS](#反向代理与-https)。 |
| `SUBBOOST_ADMIN_USERNAME` | `admin` | 首次启动时自动创建的管理员用户名。 |
| `SUBBOOST_ADMIN_PASSWORD` | 自动生成 | 首次启动时自动创建的管理员密码，至少 10 位。只在还没有管理员时生效，之后修改不会影响已有账号。`$` 的写法见 [登录](#4-登录) 上方说明。 |
| `SUBBOOST_ADMIN_RESET` | `false` | 设为 `true` 时，启动时把已有管理员重置为上面两项的账号密码，并让所有设备重新登录。登录成功后请改回 `false`。 |
| `SUBBOOST_IMAGE` | 发布版本对应的镜像 | 指定 SubBoost 镜像，例如锁定版本 `hub.1991029.xyz/ghcr.io/playfullycat/subboost:v2.16.0`；服务器能直连 ghcr.io 时可去掉 `hub.1991029.xyz/` 前缀。 |
| `POSTGRES_IMAGE` | `hub.1991029.xyz/library/postgres:16-alpine` | 数据库镜像；能直连 Docker Hub 时可设为 `postgres:16-alpine`，两者是同一个镜像，切换不影响数据。 |

示例：

```bash
APP_URL=https://sub.example.com
SUBBOOST_PORT=8080
TRUST_PROXY_HEADERS=true
```

### 自动生成的密钥

| 名称 | 用途 |
|---|---|
| `POSTGRES_PASSWORD` | 数据库密码 |
| `ENCRYPTION_KEY` | 加密数据库中的订阅链接、节点和配置 |
| `JWT_SECRET` | 签发登录会话 |
| `CRON_SECRET` | 定时任务调用内部接口的凭证 |
| `SUBBOOST_ADMIN_PASSWORD` | 管理员初始密码（没有在 `.env` 中自定义时使用） |
| `LOCAL_SETUP_TOKEN` | 备用的管理员初始化令牌（自动创建管理员失败时使用） |

它们保存在 `subboost-secrets` 数据卷中，之后每次启动都会沿用，一般不需要关心。如需查看某一项：

```bash
docker compose exec app cat /run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD
```

如果在 `.env` 中写了同名变量，会优先使用 `.env` 中的值（主要用于从旧版迁移）。

> [!WARNING]
> `subboost-secrets` 与 `subboost-db` 两个数据卷必须一起保留。丢失 `subboost-secrets` 后，数据库中已加密的订阅数据将**无法解密**。不要执行 `docker compose down -v`，迁移服务器请使用 [备份与恢复](#备份与恢复)。

### 反向代理与 HTTPS

建议通过反向代理为 SubBoost 配置 HTTPS。反向代理统一转发到 `http://127.0.0.1:3000`，`APP_URL` 填写对外的 `https://` 域名。

以 [Caddy](https://caddyserver.com/) 为例（自动申请证书）：

```caddyfile
sub.example.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
    }
}
```

Nginx 示例：

```nginx
server {
    listen 443 ssl;
    server_name sub.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后在 `.env` 中设置：

```bash
APP_URL=https://sub.example.com
TRUST_PROXY_HEADERS=true
```

关于 `TRUST_PROXY_HEADERS`，它决定按 IP 限制登录尝试次数时如何获取客户端 IP：

| 取值 | 使用的请求头 | 适用场景 |
|---|---|---|
| `false`（默认） | 不信任任何请求头，只按用户名限制（15 分钟 8 次） | 直接暴露端口 |
| `true` | `X-Real-IP`，没有时取 `X-Forwarded-For` 的**最后一项** | 一层反向代理（1Panel、宝塔、Nginx、Caddy 等） |
| `cloudflare` | 优先 `CF-Connecting-IP`，其次同 `true` | 前面还有 Cloudflare CDN（橙色云朵） |

`true` 只信任反向代理自己写入的值：反向代理需要用真实连接地址覆盖 `X-Real-IP`（Nginx 的 `$remote_addr`、Caddy 的 `{remote_host}`，如上例），客户端伪造的 `CF-Connecting-IP` 和 `X-Forwarded-For` 前几项都会被忽略。使用 `cloudflare` 时，请只允许 Cloudflare 的 IP 访问源站，否则 `CF-Connecting-IP` 可以被伪造。

只想通过反向代理访问时，把 `docker-compose.yml` 中 `app` 的端口映射改成 `"127.0.0.1:3000:3000"`，避免端口直接暴露到公网。

### 使用 1Panel 部署

[1Panel](https://1panel.cn/) 的 OpenResty 使用主机网络，反向代理可以直接访问 `127.0.0.1:3000`。以域名 `sub.example.com` 为例：

1. **创建编排**：进入「容器 → 编排 → 创建编排」，名称填 `subboost`，选择编辑模式，把 [docker-compose.yml](./docker-compose.yml) 的内容粘贴进去。
2. **修改配置**（直接在编辑框里改）：

   ```yaml
       ports:
         - "127.0.0.1:${SUBBOOST_PORT:-3000}:3000"   # 只允许本机反代访问
       environment:
         APP_URL: ${APP_URL:-https://sub.example.com}  # 改成你的域名
         TRUST_PROXY_HEADERS: ${TRUST_PROXY_HEADERS:-true}
         SUBBOOST_ADMIN_USERNAME: ${SUBBOOST_ADMIN_USERNAME:-admin}           # 可选：管理员用户名
         SUBBOOST_ADMIN_PASSWORD: ${SUBBOOST_ADMIN_PASSWORD:-至少10位的密码}  # 可选：留空则自动生成
   ```

   密码里的 `$` 要写成 `$$`，含 `#` 或空格时给整个值加双引号，例如 `"${SUBBOOST_ADMIN_PASSWORD:-my pa$$word #1}"`。3000 端口被占用时，把 `${SUBBOOST_PORT:-3000}` 改成其他端口，例如 `${SUBBOOST_PORT:-3080}`，后面反向代理地址也同步修改。确认后等待编排启动，在「容器」列表中看到 `subboost-app-1` 正常运行。
3. **创建反向代理网站**：进入「网站 → 创建网站 → 反向代理」，主域名填 `sub.example.com`，代理地址填 `http://127.0.0.1:3000`，创建。
4. **开启 HTTPS**：在该网站的「设置 → HTTPS」中申请或选择证书并启用 HTTPS（证书可在「网站 → 证书」中申请）。1Panel 默认的反代配置已经用 `$remote_addr` 设置 `X-Real-IP`，不需要再修改；如果网站前面还开了 Cloudflare CDN，把第 2 步的 `TRUST_PROXY_HEADERS` 改成 `cloudflare`。
5. **登录**：在「容器」列表中打开 `subboost-app-1` 的日志，搜索 `Password` 可以看到账号密码（自动生成或自定义的都会打印），然后打开 `https://sub.example.com` 登录。

本 README 中的 `docker compose ...` 命令需要在编排文件所在目录执行。1Panel 默认把编排保存在 `/opt/1panel/docker/compose/subboost/`（数据目录改过时以实际路径为准），可以在 1Panel 的「终端」中 `cd` 到该目录后执行。

### 从源码构建

需要自行修改代码时，在仓库根目录执行（构建需要 2 GB 以上内存）：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## 管理员账号

SubBoost 只有一个管理员账号，第一次启动时自动创建（见 [登录](#4-登录)）。以下命令都在 `docker-compose.yml` 所在目录执行。

### 找回初始密码

没有自定义密码时，自动生成的初始密码可以随时查看（修改过密码后这里仍是旧的初始密码，以修改后的为准）：

```bash
docker compose exec -T app cat /run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD
```

### 登录不上

先看日志里关于管理员的提示：

```bash
docker compose logs app | grep "\[subboost\]"
```

| 日志提示 | 原因与处理 |
|---|---|
| 打印了「用户名 / 密码」 | 用日志里打印的账号密码登录。和你填的不一样，说明 `$` 等字符被 docker compose 替换了，按 [登录](#4-登录) 上方的写法修改 |
| 「管理员账号已存在……与已有账号不一致」 | 数据库里已有之前创建的管理员（例如重新部署但没有删除数据卷），compose 中的新账号密码不会自动生效。按 [用 docker-compose 重置管理员](#用-docker-compose-重置管理员) 处理 |
| 「SUBBOOST_ADMIN_PASSWORD 无效」 | 密码少于 10 位，按提示修改后 `docker compose up -d` |
| 账号密码正确，但登录后又回到登录页 | `APP_URL` 与浏览器地址不一致（例如 `APP_URL` 是 `https://` 却用 `http://IP:端口` 访问），见 [设置访问地址](#2-设置访问地址-app_url) |

### 用 docker-compose 重置管理员

管理员已经存在、想直接改成 compose 中的账号密码时（无需执行 SQL）：

1. 在 `.env` 或 `docker-compose.yml` 中设置好 `SUBBOOST_ADMIN_USERNAME`、`SUBBOOST_ADMIN_PASSWORD`，并设置 `SUBBOOST_ADMIN_RESET=true`；
2. 执行 `docker compose up -d`，日志会打印「已重置管理员账号密码」和新的账号密码，所有设备上的旧登录都会失效；
3. 登录成功后把 `SUBBOOST_ADMIN_RESET` 改回 `false` 并再执行一次 `docker compose up -d`。不改回的话，之后在后台修改的密码会在下次重启时又被重置。

### 自动创建失败时

如果自定义的 `SUBBOOST_ADMIN_PASSWORD` 不符合要求（少于 10 位），不会自动创建管理员，日志中会给出原因和一条备用的初始化链接。可以修改密码后执行 `docker compose up -d` 重新创建，也可以打开日志中的链接手动创建：

```bash
docker compose logs app | grep setup-token
```

### 修改密码

登录后在「账户设置 → 修改密码」中输入当前密码和新密码（至少 10 位）即可。修改成功后，**其他设备上的登录会全部失效**，当前设备保持登录。为防止暴力猜测，15 分钟内最多尝试 5 次。

### 忘记密码

用 [docker-compose 重置管理员](#用-docker-compose-重置管理员)：在 `.env` 中写好新密码并开启重置，启动一次后再关掉。

```bash
# .env
SUBBOOST_ADMIN_PASSWORD='新密码，至少 10 位'
SUBBOOST_ADMIN_RESET=true
```

执行 `docker compose up -d`，日志中出现「已重置管理员账号密码」后用新密码登录，然后把 `SUBBOOST_ADMIN_RESET` 改回 `false`，再执行一次 `docker compose up -d`。所有设备上的旧登录都会失效。

### 修改用户名

```bash
docker compose exec -T db psql -U subboost -d subboost \
  -c "UPDATE \"LocalAdmin\" SET \"username\" = '新用户名', \"updatedAt\" = now();"
```

> [!CAUTION]
> 不要删除 `LocalAdmin` 表中的管理员记录来"重新初始化"：删除管理员会**连带删除所有订阅和模板**。忘记密码请使用上面的重置方法。

### 登录被锁定

为防止暴力破解，同一 IP 15 分钟内最多尝试 30 次、同一用户名最多 8 次。被锁定后等待 15 分钟，或执行 `docker compose restart app` 立即解除。

## 使用订阅

1. 登录后在首页导入机场订阅链接、YAML 文件或节点链接。
2. 选择需要的分流规则和代理组，按需配置链式代理、节点筛选等高级功能。
3. 保存订阅后，在「我的订阅」中复制订阅链接，形如 `https://sub.example.com/api/subscriptions/<token>/config.yaml`。
4. 在客户端中添加该订阅链接。推荐使用基于 **Mihomo 1.19 及以上内核** 的客户端，例如 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)、[Mihomo Party](https://github.com/mihomo-party-org/mihomo-party)、[FlClash](https://github.com/chen08209/FlClash)。

补充说明：

- 订阅链接里的 token 相当于密码，泄露后可在「我的订阅」中**重置链接**，旧链接立即失效。
- 开启自动更新后，`cron` 会按设置的间隔重新拉取机场订阅；客户端也需要开启订阅自动更新才能拿到最新节点。
- 默认不允许把本机、局域网等内网地址作为订阅源；确有需要时在「账户设置 → 订阅源安全」中开启。

### 添加到桌面

SubBoost 可以像 App 一样添加到手机或电脑桌面，从桌面图标打开时是独立窗口、没有地址栏。

- **安卓 / 电脑上的 Chrome、Edge**：打开 SubBoost 后右下角会弹出「添加 SubBoost 到桌面」，点「安装」即可；也可以在浏览器菜单中选择「安装应用」或「添加到主屏幕」。
- **iPhone / iPad**：在 Safari 中打开，点底部的「分享」按钮，选择「添加到主屏幕」。页面也会弹出这个提示。微信等 App 内置的浏览器不支持，请先用浏览器打开。
- 点「以后再说」或关闭提示后，30 天内不再弹出。
- 安装弹窗需要通过 **HTTPS**（或 `localhost`）访问才会出现。用 `http://服务器IP:3000` 访问时不会弹出，但仍可以在浏览器菜单中手动添加到桌面（会以普通网页快捷方式的形式打开）。

## 国内网络优化说明

默认配置针对在中国大陆使用做了优化：

- **规则顺序**：广告 → 私有网络 → 自定义规则 → 国内域名（精简、完整 `cn`，以及 Apple / 微软 / 谷歌 / Steam / 游戏 / 亚马逊的国内专属域名）→ AI 与各海外服务 → 海外域名 → 国内 IP → 兜底。国内 CDN、App Store、Windows 更新、Steam 国内下载等不会再被抢先走代理。
- **国内 IP 规则**：放在所有域名规则之后，并默认解析域名，用来兜住不在域名列表里的国内服务；只有前面所有域名规则都没有命中的连接才会解析，不会造成 DNS 泄露。
- **DNS**：国内和私有域名只查询阿里 / 腾讯 DoH；其余域名开启 `respect-rules`，经代理查询 Cloudflare / Google DoH；直连流量和代理节点域名使用国内 DoH。
- **下载镜像**：规则集和 GeoIP / GeoSite / ASN 数据从 jsDelivr 镜像下载，国内可直接访问。

在「基础和 DNS 配置」中自定义过的 DNS 和规则集地址不会被覆盖。从 2.13.0 之前升级时，**未改动过**的旧默认配置会在生成订阅时自动升级，客户端更新一次订阅即可生效。

## 备份与恢复

### 后台备份（推荐）

在后台「账户设置 → 备份与恢复」中操作：

- **导出**：包含全部订阅（含机场订阅链接和订阅 token）、模板和订阅源安全设置。可设置至少 8 位的备份密码，设置后整个文件会被加密（scrypt + AES-256-GCM），导入时需要输入同一密码；不设置则导出明文 JSON，请妥善保管。
- **导入**：选择备份文件后先点「检查备份」查看预览，确认后再导入：
  - **合并**：token 相同的订阅用备份中的版本更新，其余新增；同名模板跳过；不改动订阅源安全设置。
  - **覆盖**：先清空现有订阅和模板，再导入备份，结果与备份完全一致。
- 导入时会逐条校验，任何一条无效都会整体拒绝，不会写入任何数据。

备份不依赖实例的 `ENCRYPTION_KEY`，所以可以导入任何 SubBoost 实例；导入后原订阅链接继续可用，客户端无需修改。备份**不包含管理员账号**，迁移到新服务器时先在新服务器上创建管理员，再导入备份。

### 服务器整体备份

如需在服务器层面完整备份（包含管理员账号），需要同时备份数据库和密钥数据卷：

```bash
docker compose exec -T db pg_dump -U subboost -Fc subboost > subboost-db.dump
docker run --rm -v subboost_subboost-secrets:/secrets:ro -v "$PWD":/backup alpine \
  tar czf /backup/subboost-secrets.tgz -C /secrets .
```

在新服务器上恢复（`docker-compose.yml` 与两个备份文件放在同一目录，**此前不要启动过 SubBoost**）：

```bash
docker volume create subboost_subboost-secrets
docker run --rm -v subboost_subboost-secrets:/secrets -v "$PWD":/backup alpine \
  tar xzpf /backup/subboost-secrets.tgz -C /secrets
docker compose up -d db
docker compose exec -T db sh -c 'until pg_isready -U subboost -d subboost; do sleep 1; done'
docker compose exec -T db pg_restore -U subboost -d subboost --clean --if-exists --no-owner < subboost-db.dump
docker compose up -d
```

> 数据卷名称中的 `subboost_` 前缀来自 `docker-compose.yml` 中的 `name: subboost`。用 `docker volume ls` 可以查看实际名称。

## 更新、回滚与卸载

**更新到最新版本**：

```bash
docker compose pull
docker compose up -d
```

如果使用的是发布附件中锁定版本的 `docker-compose.yml`，请重新下载新版本的文件，或在 `.env` 中设置 `SUBBOOST_IMAGE=hub.1991029.xyz/ghcr.io/playfullycat/subboost:latest`。

**回滚到指定版本**：在 `.env` 中设置 `SUBBOOST_IMAGE=hub.1991029.xyz/ghcr.io/playfullycat/subboost:v2.13.0`（换成需要的版本），然后执行 `docker compose up -d`。数据库迁移只增不减，跨大版本回滚前建议先备份。

**从旧版一键脚本迁移**：把旧安装目录 `.env` 中的 `POSTGRES_PASSWORD`、`ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET`、`LOCAL_SETUP_TOKEN` 复制到新目录的 `.env`，首次启动时会沿用这些值。旧数据推荐用 [服务器整体备份](#服务器整体备份) 中的 `pg_dump` 导出后导入。

**卸载**：

```bash
docker compose down        # 停止并删除容器，保留数据
docker compose down -v     # 同时删除所有数据和密钥，无法恢复！
```

## 常见问题

**`init` 容器显示 `Exited (0)`？** 正常。它只负责生成密钥，完成后退出。

**登录后立刻又跳回登录页？** `APP_URL` 是 `https://` 开头，但你通过 `http://` 访问，浏览器不会发送安全 Cookie。请通过 HTTPS 访问，或把 `APP_URL` 改成实际访问的地址。

**订阅链接里的地址是 `localhost`？** 没有设置 `APP_URL`。在 `.env` 中设置后执行 `docker compose up -d`，再重新复制订阅链接。

**客户端提示不认识 `direct-nameserver` 等字段？** 客户端内核版本太旧，请升级到 Mihomo 1.19 及以上。

**`app` 一直不是 `healthy`？** 用 `docker compose logs app` 查看日志。常见原因是数据库数据卷来自别的安装、密码不一致；如果是全新安装，可以 `docker compose down -v` 后重新开始。

**更换服务器后订阅链接还能用吗？** 能。用后台备份导出、在新服务器导入，token 保持不变；只要新服务器使用相同的域名（`APP_URL`），客户端无需任何修改。

## 开发说明

开发者可以从源码启动本地开发环境（需要 Node.js 24.22.1+ 或 26.12.1+，以及本地 PostgreSQL）：

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

贡献说明见 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)，发行公告见 [docs/release-notes.md](./docs/release-notes.md)。

## 开源许可

SubBoost 公开源码以 [GNU Affero General Public License v3.0 only](./LICENSE) 授权。

如果你修改 SubBoost 并通过网络向用户提供服务，AGPL-3.0 要求你向这些用户提供对应源码。本分支的公开源码入口是 [Playfullycat/subboost](https://github.com/Playfullycat/subboost)，上游项目为 [SubBoost/subboost](https://github.com/SubBoost/subboost)（在线服务 [subboost.org](https://subboost.org)、文档 [docs.subboost.org](https://docs.subboost.org)）。

## 免责声明

本项目不提供任何代理服务，不对第三方订阅内容的可用性与合法性作出保证。
