# SubBoost v2.15.0

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 首次启动自动创建管理员

不再需要从日志里找初始化链接再去网页上创建管理员：

- 首次启动且还没有管理员时，自动创建管理员账号。用户名默认 `admin`，密码自动生成并打印在 `docker compose logs app` 中；日志被清理后可用 `docker compose exec app cat /run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD` 查看初始密码。
- 也可以在 `docker-compose.yml` 或 `.env` 中通过 `SUBBOOST_ADMIN_USERNAME` / `SUBBOOST_ADMIN_PASSWORD` 自己指定账号密码（至少 10 位），自定义的密码不会打印到日志。
- 只在还没有管理员时生效，之后修改这两项不会改动已有账号；已有部署升级不受影响。
- 自定义密码不符合要求时不会自动创建，日志中会给出原因和备用的初始化链接。

登录后建议在「账户设置 → 修改密码」中换成自己的密码。升级执行 `docker compose pull && docker compose up -d` 即可；1Panel 等手动粘贴 compose 的部署，可按 README 在 `app` 的 `environment` 中加入上述两项（可选）。

## English

### Admin account created on first start

No more finding a setup link in the logs and creating the admin in the browser:

- On first start with no admin, the admin account is created automatically. The username defaults to `admin`, and the generated password is printed in `docker compose logs app`; if the logs are gone, read it with `docker compose exec app cat /run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD`.
- You can also set your own credentials with `SUBBOOST_ADMIN_USERNAME` / `SUBBOOST_ADMIN_PASSWORD` (at least 10 characters) in `docker-compose.yml` or `.env`; a password you set is never printed to the logs.
- They only apply while no admin exists; changing them later does not touch the existing account, and existing deployments are unaffected by the upgrade.
- If your password does not meet the rules, no admin is created and the log explains why and prints a fallback setup link.

Changing the password under Settings → Change password after signing in is recommended. Upgrade with `docker compose pull && docker compose up -d`; deployments that paste the compose file by hand (such as 1Panel) can optionally add the two settings to the `app` `environment` as shown in the README.
