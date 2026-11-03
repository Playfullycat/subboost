# SubBoost v2.12.0

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

- 部署简化为单个 `docker-compose.yml`：下载后执行 `docker compose up -d` 即可，不再需要安装脚本。
- 数据库密码、`ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET` 和首次管理员初始化令牌在第一次启动时自动生成，保存在 `subboost-secrets` 数据卷中；初始化链接可通过 `docker compose logs app` 查看。
- 定时任务改用 SubBoost 镜像运行，不再额外拉取 curl 镜像；应用新增健康检查。
- 移除 `install.sh` 和 `subboost` 管理命令；更新改为 `docker compose pull && docker compose up -d`。

部署提示：`subboost-secrets` 与 `subboost-db` 两个数据卷必须一起保留，丢失 `subboost-secrets` 后已加密的订阅数据无法解密。不要执行 `docker compose down -v`。

## English

A fork based on upstream [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0.

- Deployment is now a single `docker-compose.yml`: download it and run `docker compose up -d`; no install script is needed.
- The database password, `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, and first-run setup token are generated on first start and stored in the `subboost-secrets` volume; find the setup link with `docker compose logs app`.
- Scheduled jobs now run on the SubBoost image instead of a separate curl image, and the app has a health check.
- Removed `install.sh` and the `subboost` manager command; update with `docker compose pull && docker compose up -d`.

Deployment note: keep the `subboost-secrets` and `subboost-db` volumes together. Losing `subboost-secrets` makes encrypted subscription data undecryptable. Do not run `docker compose down -v`.
