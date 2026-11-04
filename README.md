<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="Platform: Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.14.0-green.svg" alt="Version 2.14.0">
    <a href="https://github.com/Playfullycat/subboost/pkgs/container/subboost"><img src="https://img.shields.io/badge/image-GHCR-blue.svg" alt="GHCR image"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-orange.svg" alt="AGPL-3.0"></a>
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** is a **Clash / Mihomo subscription conversion, enhancement, and management** tool. It turns airport subscriptions and self-hosted nodes into optimized aggregated subscriptions that refresh automatically, and lets you configure **chained proxies, precise routing, DNS leak protection, and multi-subscription aggregation** from a visual UI.

This repository is a fork of [SubBoost/subboost](https://github.com/SubBoost/subboost). On top of upstream it mainly adds:

- **Single-file deployment**: one `docker-compose.yml`; every secret is generated on first start, with no install script and nothing to fill in by hand.
- **Better routing inside mainland China**: China domain rules come first, the China IP rule comes last and resolves domains, the default DNS splits China and overseas lookups, and rule sets and Geo data download from a mirror reachable in China. This fixes China services being slow or unreachable while the proxy is on.
- **Backup and restore**: export and import all subscriptions, templates, and settings from the dashboard, optionally encrypted and portable between instances; existing subscription links keep working after an import.

## Contents

- [Features](#features)
- [Screenshot](#screenshot)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Reverse proxy and HTTPS](#reverse-proxy-and-https)
  - [Deploy with 1Panel](#deploy-with-1panel)
- [Admin Account](#admin-account)
- [Using Subscriptions](#using-subscriptions)
- [Routing Inside Mainland China](#routing-inside-mainland-china)
- [Backup and Restore](#backup-and-restore)
- [Update, Rollback, and Uninstall](#update-rollback-and-uninstall)
- [FAQ](#faq)
- [Development](#development)
- [License](#license)

## Features

- **Subscription conversion**: import subscription links, YAML files, and node links.
- **Node management**: bulk rename or delete nodes, or configure listener ports.
- **Node filtering**: filter nodes by import source, region, and custom rules in advanced routing group mode.
- **Chained proxies**: configure chained proxies and `relay proxy groups` visually.
- **Precise routing**: 30+ common proxy groups and 2000+ remote rule sets ready to enable.
- **Rule management**: reorder rules for advanced customization.
- **DNS leak protection**: the default `Base and DNS config` keeps China and overseas DNS strictly apart and resolves overseas domains through the proxy.
- **Automatic refresh**: refresh subscriptions on a schedule with smart node matching.
- **Backup and restore**: export and import subscriptions, templates, and settings, with optional password encryption.

## Screenshot

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost visual configuration UI" width="960">
</p>

## Quick Start

### Requirements

- A Linux server (x86_64 or arm64), 1 GB+ memory recommended.
- [Docker](https://docs.docker.com/engine/install/) with Docker Compose v2 (`docker compose version` should work).
- A free port, `3000` by default.

### 1. Download the Compose file

```bash
mkdir -p ~/subboost && cd ~/subboost
curl -fsSLO https://github.com/Playfullycat/subboost/releases/latest/download/docker-compose.yml
```

> The `docker-compose.yml` attached to a release is pinned to that release's image. You can also use the repository's [docker-compose.yml](./docker-compose.yml), which uses the `latest` image.

### 2. Set the access URL `APP_URL`

Create a `.env` file in the same directory with **the address you type into the browser's address bar to open SubBoost**:

```bash
cat > .env <<'EOF'
APP_URL=https://sub.example.com
EOF
```

`APP_URL` sets the address of subscription links and the setup link, and decides whether the login cookie is HTTPS-only. Pick the value that matches how you access it:

| Access | `APP_URL` |
|---|---|
| Reverse proxy + domain + HTTPS (1Panel, BT Panel, Caddy, Nginx, …) | `https://sub.example.com` |
| Reverse proxy + domain without HTTPS | `http://sub.example.com` |
| Server IP and port directly | `http://1.2.3.4:3000` (same port as `SUBBOOST_PORT`) |
| Same machine only | Leave unset; defaults to `http://localhost:3000` |

Rules:

- It must **exactly match** the browser address: scheme (`http` / `https`), domain or IP, and port. No path and no trailing `/`.
- Behind a reverse proxy, use the **public domain address**, not the proxy target `http://127.0.0.1:3000`.
- If it says `https://` but you open the site over `http://`, sign-in fails (the browser will not send the secure cookie).
- After changing `APP_URL`, run `docker compose up -d`; the dashboard shows subscription links with the new address. Links already added to clients need to be copied again if the old address no longer works.

For 1Panel, see [Deploy with 1Panel](#deploy-with-1panel). See [Configuration](#configuration) for more options.

### 3. Start

```bash
docker compose up -d
```

On first start:

1. The `init` container generates the database password, `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, and the first-run setup token, stores them in the `subboost-secrets` volume, and exits (`Exited (0)` is expected).
2. `db` (PostgreSQL) initializes the database.
3. `app` applies database migrations and starts the web server.
4. `cron` checks subscriptions due for automatic refresh every 6 minutes and refreshes the rule catalog every hour.

Run `docker compose ps`; once `app` shows `healthy`, it is ready.

### 4. Create the admin

```bash
docker compose logs app | grep setup-token
```

Open the **first-run setup link** from the output (like `http://your-address/login#setup-token=...`) and choose an admin username and password (at least 10 characters). You are signed in right away, and the setup link stops working.

> [!WARNING]
> Until the admin exists, anyone with the setup link can create it. Finish this step right after deploying and do not share the link.

### 5. Start using it

After signing in, import airport subscriptions or nodes, pick routing rules, save the subscription, and add the generated link to your client. See [Using Subscriptions](#using-subscriptions).

## Configuration

### Optional settings

Put settings in a `.env` file next to `docker-compose.yml` and run `docker compose up -d` to apply them.

| Variable | Default | Description |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | The address browsers and clients use to reach SubBoost; used to build subscription links. With `https://`, the login cookie is only sent over HTTPS. |
| `SUBBOOST_PORT` | `3000` | The port published on the server. Update `APP_URL` when you change it. |
| `TRUST_PROXY_HEADERS` | `false` | When `true`, sign-in rate limits use the client IP passed by the reverse proxy. Enable it only if the proxy overwrites `X-Real-IP` and drops `CF-Connecting-IP`; see [Reverse proxy and HTTPS](#reverse-proxy-and-https). Keep `false` when the port is exposed directly. |
| `SUBBOOST_IMAGE` | The release's image | Override the image, for example to pin `ghcr.io/playfullycat/subboost:v2.14.0`. |

Example:

```bash
APP_URL=https://sub.example.com
SUBBOOST_PORT=8080
TRUST_PROXY_HEADERS=true
```

### Generated secrets

| Name | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `ENCRYPTION_KEY` | Encrypts subscription links, nodes, and configs in the database |
| `JWT_SECRET` | Signs login sessions |
| `CRON_SECRET` | Lets scheduled jobs call internal endpoints |
| `LOCAL_SETUP_TOKEN` | First-run admin setup token |

They live in the `subboost-secrets` volume and are reused on every start, so you normally never touch them. To read one:

```bash
docker compose exec app cat /run/subboost/secrets/LOCAL_SETUP_TOKEN
```

A variable with the same name in `.env` takes precedence (mainly for migrating from the old installer).

> [!WARNING]
> Keep the `subboost-secrets` and `subboost-db` volumes together. Losing `subboost-secrets` makes the encrypted subscription data in the database **undecryptable**. Do not run `docker compose down -v`; use [Backup and Restore](#backup-and-restore) to move servers.

### Reverse proxy and HTTPS

Serving SubBoost over HTTPS through a reverse proxy is recommended. Point the proxy at `http://127.0.0.1:3000` and set `APP_URL` to the public `https://` domain.

With [Caddy](https://caddyserver.com/) (automatic certificates):

```caddyfile
sub.example.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up -CF-Connecting-IP
    }
}
```

With Nginx:

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
        proxy_set_header CF-Connecting-IP "";
    }
}
```

Then set in `.env`:

```bash
APP_URL=https://sub.example.com
TRUST_PROXY_HEADERS=true
```

About `TRUST_PROXY_HEADERS`: SubBoost reads the client IP from `CF-Connecting-IP`, then `X-Real-IP`, then `X-Forwarded-For` to rate limit sign-in attempts per IP. Before turning it on, the proxy must **overwrite `X-Real-IP` with the real connecting address and drop any client-supplied `CF-Connecting-IP`** (as in the examples above); otherwise attackers can fake IPs to dodge the per-IP limit. If you cannot guarantee that, keep it `false`; the limit of 8 attempts per username every 15 minutes always applies. If Cloudflare's CDN (orange cloud) sits in front, keep `CF-Connecting-IP` and only allow Cloudflare IPs to reach the origin.

To allow access only through the proxy, change the `app` port mapping in `docker-compose.yml` to `"127.0.0.1:3000:3000"` so the port is not exposed publicly.

### Deploy with 1Panel

[1Panel](https://1panel.pro/)'s OpenResty uses host networking, so its reverse proxy can reach `127.0.0.1:3000` directly. Using the domain `sub.example.com`:

1. **Create the compose stack**: go to **Containers → Compose → Create** (`容器 → 编排 → 创建编排`), name it `subboost`, choose the editor mode, and paste the contents of [docker-compose.yml](./docker-compose.yml).
2. **Edit two settings** directly in the editor:

   ```yaml
       ports:
         - "127.0.0.1:${SUBBOOST_PORT:-3000}:3000"   # only reachable by the local proxy
       environment:
         APP_URL: ${APP_URL:-https://sub.example.com}  # your domain
         TRUST_PROXY_HEADERS: ${TRUST_PROXY_HEADERS:-true}
   ```

   If port 3000 is taken, change `${SUBBOOST_PORT:-3000}` to another port such as `${SUBBOOST_PORT:-3080}` and use it in the proxy address below. Confirm and wait until `subboost-app-1` is running in the container list.
3. **Create the reverse proxy site**: go to **Websites → Create → Reverse proxy** (`网站 → 创建网站 → 反向代理`), set the primary domain to `sub.example.com` and the proxy address to `http://127.0.0.1:3000`, and create it.
4. **Enable HTTPS**: in the site's **Settings → HTTPS**, apply for or pick a certificate and enable HTTPS (certificates can be requested under **Websites → Certificates**).
5. **Block forged IPs**: 1Panel's default proxy config already sets `X-Real-IP` from `$remote_addr`, but passes a client-supplied `CF-Connecting-IP` through. Add this line to the `location` in the site's reverse proxy config (**Settings → Reverse proxy → Source**):

   ```nginx
   proxy_set_header CF-Connecting-IP "";
   ```

   Skip this step if Cloudflare's CDN sits in front of the site. If you would rather not edit the proxy config, set `TRUST_PROXY_HEADERS` in step 2 back to `false`.
6. **Create the admin**: open the logs of `subboost-app-1` from the container list, search for `setup-token`, and open the `https://sub.example.com/login#setup-token=...` link to create the admin.

Run the `docker compose ...` commands in this README from the directory that holds the compose file. 1Panel stores stacks in `/opt/1panel/docker/compose/subboost/` by default (use your real path if you changed the data directory); `cd` there from 1Panel's **Terminal** first.

### Build from source

To run your own code changes, run this in the repository root (building needs 2 GB+ memory):

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Admin Account

SubBoost has a single admin account, created through the setup link on first visit (see [Create the admin](#4-create-the-admin)). Run the commands below in the directory that contains `docker-compose.yml`.

### Lost the setup link

```bash
docker compose logs app | grep setup-token
```

If the logs are gone, read the token and append it to your address: `<APP_URL>/login#setup-token=<token>`.

```bash
docker compose exec -T app cat /run/subboost/secrets/LOCAL_SETUP_TOKEN
```

### Change the password

After signing in, go to **Settings → Change password** (`账户设置 → 修改密码`) and enter the current and new password (at least 10 characters). Once it changes, **every other signed-in device is logged out**, and the current device stays signed in. To slow down guessing, you get 5 attempts every 15 minutes.

### Forgot the password

If you cannot sign in, reset the password on the server (at least 10 characters; leading and trailing spaces are ignored):

```bash
read -rsp "New password: " NEW_PASSWORD; echo
HASH=$(docker compose exec -T -e NEW_PASSWORD="$NEW_PASSWORD" app \
  node -e 'process.stdout.write(require("bcryptjs").hashSync(process.env.NEW_PASSWORD.trim(), 12))')
docker compose exec -T db psql -U subboost -d subboost \
  -c "UPDATE \"LocalAdmin\" SET \"passwordHash\" = '$HASH', \"sessionsValidAfter\" = now(), \"updatedAt\" = now();"
unset NEW_PASSWORD HASH
```

`UPDATE 1` means it worked. No restart is needed; sign in with the new password. Existing sign-ins on every device stop working.

### Change the username

```bash
docker compose exec -T db psql -U subboost -d subboost \
  -c "UPDATE \"LocalAdmin\" SET \"username\" = 'new-username', \"updatedAt\" = now();"
```

> [!CAUTION]
> Do not delete the admin row in the `LocalAdmin` table to "start over": deleting the admin **also deletes every subscription and template**. Use the reset above if you forgot the password.

### Locked out of sign-in

To slow down brute-force attempts, sign-in allows 30 attempts per IP and 8 per username every 15 minutes. Wait 15 minutes, or run `docker compose restart app` to clear the lock immediately.

## Using Subscriptions

1. After signing in, import airport subscription links, YAML files, or node links on the home page.
2. Choose routing rules and proxy groups, and configure chained proxies, node filters, and other advanced options as needed.
3. Save the subscription, then copy its link from **My Subscriptions** (`我的订阅`). It looks like `https://sub.example.com/api/subscriptions/<token>/config.yaml`.
4. Add the link to your client. Clients built on **Mihomo 1.19 or newer** are recommended, such as [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party), or [FlClash](https://github.com/chen08209/FlClash).

Notes:

- The token in the subscription link works like a password. If it leaks, use **Reset link** in My Subscriptions; the old link stops working immediately.
- With automatic refresh enabled, `cron` re-fetches airport subscriptions at the chosen interval; enable subscription auto-update in your client too to receive new nodes.
- Local and LAN addresses are not allowed as subscription sources by default; enable them under **Settings → Source security** (`账户设置 → 订阅源安全`) only if you trust them.

## Routing Inside Mainland China

The defaults are tuned for use in mainland China:

- **Rule order**: ads → private networks → custom rules → China domains (the reduced and full `cn` lists plus China-only Apple / Microsoft / Google / Steam / games / Amazon lists) → AI and foreign services → non-China domains → China IP → final. China CDNs, App Store, Windows Update, Steam China downloads, and similar traffic no longer get caught by foreign service rules first.
- **China IP rule**: placed after every domain rule and resolves domains by default, catching China services missing from the domain lists. Only connections that matched no domain rule are resolved, so it does not leak DNS.
- **DNS**: China and private domains only use AliDNS / DNSPod DoH; everything else uses Cloudflare / Google DoH through the proxy with `respect-rules`; direct traffic and proxy server domains use China DoH.
- **Download mirror**: rule sets and the GeoIP / GeoSite / ASN databases download from the jsDelivr mirror, which is reachable in China.

DNS settings and rule set URLs you customized in `Base and DNS config` are never overwritten. When upgrading from before 2.13.0, **untouched** legacy defaults upgrade automatically when the subscription is generated; clients only need to refresh once.

## Backup and Restore

### Dashboard backup (recommended)

Go to **Settings → Backup & Restore** (`账户设置 → 备份与恢复`):

- **Export** includes every subscription (with airport links and subscription tokens), templates, and the source security setting. Optionally set a backup password of at least 8 characters to encrypt the whole file (scrypt + AES-256-GCM); the same password is required to import it. Without a password the file is plain JSON, so keep it safe.
- **Import**: choose a backup file, click **Check backup** (`检查备份`) to preview, then confirm:
  - **Merge**: subscriptions with the same token are updated from the backup and the rest are added; templates with the same name are skipped; the source security setting is left alone.
  - **Replace**: existing subscriptions and templates are cleared first, so the result matches the backup exactly.
- Every record is validated first; if any record is invalid, nothing is written.

Backups do not depend on the instance `ENCRYPTION_KEY`, so they import into any SubBoost instance, and existing subscription links keep working without client changes. Backups **do not include the admin account**: when moving to a new server, create the admin there first, then import.

### Full server backup

To back up everything at the server level (including the admin account), back up the database and the secrets volume together:

```bash
docker compose exec -T db pg_dump -U subboost -Fc subboost > subboost-db.dump
docker run --rm -v subboost_subboost-secrets:/secrets:ro -v "$PWD":/backup alpine \
  tar czf /backup/subboost-secrets.tgz -C /secrets .
```

To restore on a new server, put `docker-compose.yml` and both backup files in one directory **before SubBoost has ever started there**:

```bash
docker volume create subboost_subboost-secrets
docker run --rm -v subboost_subboost-secrets:/secrets -v "$PWD":/backup alpine \
  tar xzpf /backup/subboost-secrets.tgz -C /secrets
docker compose up -d db
docker compose exec -T db sh -c 'until pg_isready -U subboost -d subboost; do sleep 1; done'
docker compose exec -T db pg_restore -U subboost -d subboost --clean --if-exists --no-owner < subboost-db.dump
docker compose up -d
```

> The `subboost_` prefix in volume names comes from `name: subboost` in `docker-compose.yml`. Run `docker volume ls` to see the actual names.

## Update, Rollback, and Uninstall

**Update to the latest version**:

```bash
docker compose pull
docker compose up -d
```

If you use a release's pinned `docker-compose.yml`, download the new release's file, or set `SUBBOOST_IMAGE=ghcr.io/playfullycat/subboost:latest` in `.env`.

**Roll back to a version**: set `SUBBOOST_IMAGE=ghcr.io/playfullycat/subboost:v2.13.0` (use the version you need) in `.env`, then run `docker compose up -d`. Database migrations only move forward, so back up before rolling back across major versions.

**Migrating from the old one-click installer**: copy `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, and `LOCAL_SETUP_TOKEN` from the old installation's `.env` into a `.env` in the new directory; first start reuses them. Move old data with the `pg_dump` steps in [Full server backup](#full-server-backup).

**Uninstall**:

```bash
docker compose down        # stop and remove containers, keep data
docker compose down -v     # also delete all data and secrets, irreversibly!
```

## FAQ

**The `init` container shows `Exited (0)`?** Expected. It only generates secrets and then exits.

**Signing in sends me straight back to the login page?** `APP_URL` starts with `https://` but you opened SubBoost over `http://`, so the browser does not send the secure cookie. Use HTTPS, or set `APP_URL` to the address you actually use.

**The subscription link points at `localhost`?** `APP_URL` is not set. Set it in `.env`, run `docker compose up -d`, and copy the link again.

**My client rejects fields like `direct-nameserver`?** Its core is too old; upgrade to Mihomo 1.19 or newer.

**`app` never becomes `healthy`?** Check `docker compose logs app`. A common cause is a database volume from another installation with a different password; for a fresh install you can `docker compose down -v` and start over.

**Do subscription links survive moving servers?** Yes. Export a dashboard backup and import it on the new server; tokens stay the same, so clients need no changes as long as the new server uses the same domain (`APP_URL`).

## Development

Start a local development environment from source (requires Node.js 24.22.1+ or 26.12.1+ and a local PostgreSQL):

```bash
npm ci
npm run dev
```

Common checks:

```bash
npm run lint
npm run test:unit
npm run check:local-app
```

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) for contributing and [docs/release-notes.md](./docs/release-notes.md) for release notes.

## License

SubBoost public source code is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).

If you modify SubBoost and provide it to users over a network, AGPL-3.0 requires you to make the corresponding source code available to those users. This fork's public source is [Playfullycat/subboost](https://github.com/Playfullycat/subboost); the upstream project is [SubBoost/subboost](https://github.com/SubBoost/subboost) (hosted service at [subboost.org](https://subboost.org), docs at [docs.subboost.org](https://docs.subboost.org)).

## Disclaimer

This project does not provide proxy services and makes no guarantees about the availability or legality of third-party subscription content.
