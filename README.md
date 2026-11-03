<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost" width="96"></p>
  <h1>SubBoost</h1>
  <p>
    <img src="https://img.shields.io/badge/platform-Linux%20%2B%20Docker-lightgrey.svg" alt="Platform: Linux + Docker">
    <img src="https://img.shields.io/badge/version-2.12.0-green.svg" alt="Version 2.12.0">
    <a href="https://subboost.org"><img src="https://img.shields.io/badge/app-subboost.org-brightgreen.svg" alt="Online app"></a>
    <a href="https://docs.subboost.org"><img src="https://img.shields.io/badge/docs-subboost.org-blue.svg" alt="Documentation"></a>
    <img src="https://img.shields.io/badge/image-GHCR-blue.svg" alt="GHCR image">
  </p>
  <p><strong><a href="README.md">English</a> | <a href="README-CN.md">中文</a></strong></p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost** is a **Clash/Mihomo subscription conversion, enhancement, and management** tool. It can convert airport subscriptions and self-hosted nodes into optimized aggregate subscriptions, then update them automatically. With the visual UI, you can configure advanced features such as **chained proxies, precise routing, DNS leak prevention, and multi-subscription aggregation** in one click.

## Highlights & Use Cases

- **Subscription conversion**: Import subscription links, YAML files, node links, and other common formats.
- **Node management**: Rename, delete, or configure listening ports for nodes in batches.
- **Node filtering**: Build `filtered proxy groups` with only selected nodes by source, region, and custom rules.
- **Chained proxies**: Configure chained proxies and `relay proxy groups` visually in one click.
- **Precise routing**: Enable more than 30 common proxy groups and over 2,000 remote rule sets.
- **Rule management**: Reorder rules for deeper customization by advanced users.
- **DNS leak prevention**: The default `basic and DNS configuration` helps prevent DNS leaks.
- **Automatic refresh**: Refresh subscriptions on a schedule and intelligently match nodes during refresh.

## Interface Preview

<p align="center">
  <img src="docs/assets/screenshot-main.png" alt="SubBoost visual configuration interface" width="960">
</p>

## Usage & Deployment

- Online entry: [No deployment required - direct access to the public service](https://subboost.org)
- Configuration guide: [Clash configuration simple enough for a paramecium: configure precise routing and chained proxies from the UI in one click](https://ryanvan.com/t/topic/59?u=ryan)

### Docker Compose Deployment

All you need is Docker with the Compose plugin; no install script is required:

```bash
mkdir subboost && cd subboost
curl -fsSLO https://github.com/Playfullycat/subboost/releases/latest/download/docker-compose.yml
docker compose up -d
docker compose logs app | grep setup-token
```

Open the first-run setup link from the log to create the first administrator.

- **No secrets to configure**: the database password, `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, and `LOCAL_SETUP_TOKEN` are generated on first start and stored in the `subboost-secrets` volume.
- **Address and port**: defaults to `http://localhost:3000`. When accessing through a public IP or domain, change `APP_URL` and the port mapping in `docker-compose.yml`, or create a `.env` next to it with `APP_URL=https://sub.example.com` and `SUBBOOST_PORT=8080`.
- **Update**: `docker compose pull && docker compose up -d`.
- **Build from source**: run `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build` in the repository root (2 GB+ memory recommended).
- **Migrating from the old one-click script**: copy `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, and `LOCAL_SETUP_TOKEN` from the old installation's `.env` into a `.env` in the new directory; first start reuses them. Old database data must be moved through a backup import.
- **Backup and restore**: in the dashboard, open Settings → Backup & Restore to export a backup file (optionally password-encrypted) and import it on any instance. Backups include subscriptions (keeping their subscription link tokens), templates, and the source security setting, and do not depend on the instance `ENCRYPTION_KEY`; imports support merge and replace modes.

> [!WARNING]
> Keep the `subboost-secrets` and `subboost-db` volumes together. Losing `subboost-secrets` makes encrypted subscription data undecryptable. Do not run `docker compose down -v`.

## Development Notes

Developers can start a local development environment from source:

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

## Links

- Online entry: [https://subboost.org](https://subboost.org)
- Deployment docs: [https://docs.subboost.org](https://docs.subboost.org)
- Release announcements: [docs/release-notes.md](./docs/release-notes.md)
- Changelog: [https://subboost.org/faq](https://subboost.org/faq)
- Forum feedback: [LINUX DO](https://linux.do/) & [IDC Flare](https://idcflare.com/).

## Star History

<a href="https://www.star-history.com/?repos=subboost%2Fsubboost&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=subboost/subboost&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=subboost/subboost&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=subboost/subboost&type=date&legend=top-left" />
 </picture>
</a>

## License

The public SubBoost source code is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).

If you modify SubBoost and provide it to users over a network, AGPL-3.0 requires you to offer those users the corresponding source code. The public source for this fork is [Playfullycat/subboost](https://github.com/Playfullycat/subboost); the upstream project is [SubBoost/subboost](https://github.com/SubBoost/subboost).

## Disclaimer

This project does not provide any proxy service and makes no guarantee about the availability or legality of third-party subscription content.
