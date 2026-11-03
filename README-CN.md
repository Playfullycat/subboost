<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="平台：Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.14.0-green.svg" alt="版本 2.14.0">
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

### 1. 下载配置文件

```bash
mkdir -p ~/subboost && cd ~/subboost
curl -fsSLO https://github.com/Playfullycat/subboost/releases/latest/download/docker-compose.yml
```

> 发布附件里的 `docker-compose.yml` 已锁定为对应版本的镜像。也可以直接使用仓库根目录的 [docker-compose.yml](./docker-compose.yml)，它默认使用 `latest` 镜像。

### 2. 设置访问地址（推荐）

在同一目录新建 `.env` 文件，写入你在浏览器中访问 SubBoost 的地址：

```bash
cat > .env <<'EOF'
APP_URL=http://你的服务器IP:3000
EOF
```

`APP_URL` 用于生成订阅链接，必须是客户端能访问到的地址。只在本机使用时可以跳过这一步（默认 `http://localhost:3000`）。更多选项见 [配置说明](#配置说明)。

### 3. 启动

```bash
docker compose up -d
```

第一次启动时会自动完成：

1. `init` 容器生成数据库密码、`ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET` 和首次管理员初始化令牌，保存到 `subboost-secrets` 数据卷，然后退出（状态显示 `Exited (0)` 属于正常）。
2. `db`（PostgreSQL）初始化数据库。
3. `app` 执行数据库迁移并启动网页服务。
4. `cron` 每 6 分钟检查一次需要自动更新的订阅，并每小时刷新一次规则库索引。

用 `docker compose ps` 查看状态，`app` 显示 `healthy` 即启动完成。

### 4. 创建管理员

```bash
docker compose logs app | grep setup-token
```

在浏览器打开输出中的 **首次初始化链接**（形如 `http://你的地址/login#setup-token=...`），设置管理员用户名和密码（密码至少 10 位）。创建成功后会自动登录，初始化链接随即失效。

> [!WARNING]
> 在创建管理员之前，任何拿到初始化链接的人都可以抢先创建管理员。请部署后尽快完成这一步，不要把链接发给别人。

### 5. 开始使用

登录后即可导入机场订阅或节点、选择分流规则并保存订阅，然后把生成的订阅链接添加到客户端，详见 [使用订阅](#使用订阅)。

## 配置说明

### 可选配置项

所有配置都可以写在 `docker-compose.yml` 同目录的 `.env` 文件中，修改后执行 `docker compose up -d` 生效。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | 浏览器和客户端访问 SubBoost 的地址，用于生成订阅链接。使用 `https://` 时登录 Cookie 只会通过 HTTPS 发送。 |
| `SUBBOOST_PORT` | `3000` | 服务器上对外暴露的端口。修改后记得同步修改 `APP_URL`。 |
| `TRUST_PROXY_HEADERS` | `false` | 只有放在会清洗并重写 `X-Forwarded-For` / `X-Real-IP` 的反向代理之后时才设为 `true`，用于按真实客户端 IP 限制登录频率。直接暴露端口时保持 `false`。 |
| `SUBBOOST_IMAGE` | 发布版本对应的镜像 | 指定镜像，例如锁定版本 `ghcr.io/playfullycat/subboost:v2.14.0`。 |

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
| `LOCAL_SETUP_TOKEN` | 首次创建管理员的初始化令牌 |

它们保存在 `subboost-secrets` 数据卷中，之后每次启动都会沿用，一般不需要关心。如需查看某一项：

```bash
docker compose exec app cat /run/subboost/secrets/LOCAL_SETUP_TOKEN
```

如果在 `.env` 中写了同名变量，会优先使用 `.env` 中的值（主要用于从旧版迁移）。

> [!WARNING]
> `subboost-secrets` 与 `subboost-db` 两个数据卷必须一起保留。丢失 `subboost-secrets` 后，数据库中已加密的订阅数据将**无法解密**。不要执行 `docker compose down -v`，迁移服务器请使用 [备份与恢复](#备份与恢复)。

### 反向代理与 HTTPS

建议通过反向代理为 SubBoost 配置 HTTPS。以 [Caddy](https://caddyserver.com/) 为例（自动申请证书）：

```caddyfile
sub.example.com {
    reverse_proxy 127.0.0.1:3000
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

然后在 `.env` 中设置 `APP_URL=https://sub.example.com` 和 `TRUST_PROXY_HEADERS=true`。如果只想通过反向代理访问，可以把 `docker-compose.yml` 中的端口映射改成 `"127.0.0.1:3000:3000"`，避免端口直接暴露到公网。

### 从源码构建

需要自行修改代码时，在仓库根目录执行（构建需要 2 GB 以上内存）：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## 管理员账号

SubBoost 只有一个管理员账号，第一次访问时通过初始化链接创建（见 [创建管理员](#4-创建管理员)）。以下命令都在 `docker-compose.yml` 所在目录执行。

### 找不到初始化链接

```bash
docker compose logs app | grep setup-token
```

如果日志已被清理，可以直接读取令牌，把它拼到你的访问地址后面：`<APP_URL>/login#setup-token=<令牌>`。

```bash
docker compose exec -T app cat /run/subboost/secrets/LOCAL_SETUP_TOKEN
```

### 修改密码

登录后在「账户设置 → 修改密码」中输入当前密码和新密码（至少 10 位）即可。修改成功后，**其他设备上的登录会全部失效**，当前设备保持登录。为防止暴力猜测，15 分钟内最多尝试 5 次。

### 忘记密码

忘记密码时无法登录，可以在服务器上直接重置（新密码至少 10 位，首尾空格会被忽略）：

```bash
read -rsp "新密码: " NEW_PASSWORD; echo
HASH=$(docker compose exec -T -e NEW_PASSWORD="$NEW_PASSWORD" app \
  node -e 'process.stdout.write(require("bcryptjs").hashSync(process.env.NEW_PASSWORD.trim(), 12))')
docker compose exec -T db psql -U subboost -d subboost \
  -c "UPDATE \"LocalAdmin\" SET \"passwordHash\" = '$HASH', \"sessionsValidAfter\" = now(), \"updatedAt\" = now();"
unset NEW_PASSWORD HASH
```

输出 `UPDATE 1` 即修改成功，无需重启，用新密码登录即可；所有设备上的旧登录都会失效。

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

如果使用的是发布附件中锁定版本的 `docker-compose.yml`，请重新下载新版本的文件，或在 `.env` 中设置 `SUBBOOST_IMAGE=ghcr.io/playfullycat/subboost:latest`。

**回滚到指定版本**：在 `.env` 中设置 `SUBBOOST_IMAGE=ghcr.io/playfullycat/subboost:v2.13.0`（换成需要的版本），然后执行 `docker compose up -d`。数据库迁移只增不减，跨大版本回滚前建议先备份。

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
