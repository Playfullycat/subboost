# SubBoost v2.16.0

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 镜像默认通过镜像站拉取

- `docker-compose.yml` 中的 SubBoost 和 PostgreSQL 镜像默认改为通过 `hub.1991029.xyz` 镜像站拉取，国内服务器无需配置 Docker 加速即可部署：
  - `hub.1991029.xyz/ghcr.io/playfullycat/subboost`
  - `hub.1991029.xyz/library/postgres:16-alpine`（与 `postgres:16-alpine` 是同一个镜像，切换不影响数据）
- 发布附件中锁定版本的 `docker-compose.yml` 同样通过镜像站按摘要拉取。
- 服务器能直连 ghcr.io 和 Docker Hub 时，可在 `.env` 中通过 `SUBBOOST_IMAGE` 和新增的 `POSTGRES_IMAGE` 改回官方地址。

### 添加到桌面

- 修正 PWA 图标：新增 192、512 和 maskable 图标，以及 iPhone 专用图标。
- Chrome、Edge 和安卓浏览器中会弹出「添加 SubBoost 到桌面」，点「安装」即可；iPhone / iPad 会提示通过「分享 → 添加到主屏幕」添加。关闭后 30 天内不再提示。
- 安装弹窗需要通过 HTTPS 访问才会出现；通过 `http://IP:端口` 访问时仍可在浏览器菜单中手动添加。

### 镜像体积减半

- 运行镜像只保留 Next.js standalone 输出，数据库迁移用的 Prisma 命令行单独安装在 `/opt/prisma`，不再复制完整的 `node_modules`（含构建工具）。
- 解压后从 1.32GB 降到 683MB，下载大小从约 267MB 降到约 147MB。
- README「忘记密码」统一使用 `SUBBOOST_ADMIN_RESET`，移除了在容器内手动生成密码哈希的命令（新镜像中不再可用）。

升级提示：执行 `docker compose pull && docker compose up -d` 即可，数据不受影响。使用自己维护的 `docker-compose.yml` 时，镜像地址不会自动改变；需要镜像站时，把 `image` 改成上面的地址，或在 `.env` 中设置 `SUBBOOST_IMAGE` 和 `POSTGRES_IMAGE`。

## English

### Images pulled through a registry mirror by default

- The SubBoost and PostgreSQL images in `docker-compose.yml` now pull through the `hub.1991029.xyz` mirror by default, so servers in mainland China can deploy without a Docker mirror:
  - `hub.1991029.xyz/ghcr.io/playfullycat/subboost`
  - `hub.1991029.xyz/library/postgres:16-alpine` (the same image as `postgres:16-alpine`; switching keeps your data)
- The pinned `docker-compose.yml` attached to releases also pulls by digest through the mirror.
- If your server reaches ghcr.io and Docker Hub directly, switch back to the official names with `SUBBOOST_IMAGE` and the new `POSTGRES_IMAGE` in `.env`.

### Add to Home Screen

- Fixed the PWA icons: added 192, 512 and maskable icons, plus an iPhone icon.
- Chrome, Edge and Android browsers show an "Add SubBoost to desktop" card with an Install button; iPhone and iPad show how to use Share → Add to Home Screen. After closing, it stays hidden for 30 days.
- The install dialog only appears over HTTPS; over `http://IP:port` you can still add a shortcut from the browser menu.

### Half-size image

- The runtime image keeps only the Next.js standalone output, with the Prisma CLI for database migrations installed separately in `/opt/prisma`, instead of copying the full `node_modules` (including build tools).
- Uncompressed size drops from 1.32GB to 683MB; the download drops from about 267MB to about 147MB.
- "Forgot the password" in the README now uses `SUBBOOST_ADMIN_RESET` only; the command that hashed a password inside the container is gone (it no longer works in the new image).

Upgrade note: run `docker compose pull && docker compose up -d`; your data is unaffected. If you maintain your own `docker-compose.yml`, the image names don't change automatically; to use the mirror, set `image` to the names above, or set `SUBBOOST_IMAGE` and `POSTGRES_IMAGE` in `.env`.
