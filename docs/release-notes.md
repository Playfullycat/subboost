# SubBoost v2.15.1

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 修复：在 docker-compose 中设置管理员密码后无法登录

- 每次启动都会检查管理员账号并打印到 `docker compose logs app`：新建时打印用户名和实际生效的密码（自动生成或在 docker-compose 中设置的都会打印）；已有管理员且与配置一致时再次打印；与配置不一致时说明原因和处理方法，不再静默跳过。
- 新增 `SUBBOOST_ADMIN_RESET=true`：启动时把已有管理员重置为 docker-compose 中的账号密码，并让所有设备重新登录；登录成功后改回 `false`。
- 文档说明密码中特殊字符的写法：`$` 会被 docker compose 当成变量替换，在 `.env` 中用单引号包住整个密码，或在 docker-compose.yml 中把 `$` 写成 `$$`；含 `#` 或空格时给整个值加双引号。README 新增「登录不上」排查表。

升级提示：执行 `docker compose pull && docker compose up -d` 即可。之前因密码被替换而无法登录的部署，在 `.env` 中设置正确的 `SUBBOOST_ADMIN_PASSWORD` 和 `SUBBOOST_ADMIN_RESET=true` 后执行 `docker compose up -d`，登录成功后再把 `SUBBOOST_ADMIN_RESET` 改回 `false`。

## English

### Fix: cannot sign in after setting the admin password in docker-compose

- Every start checks the admin account and reports it in `docker compose logs app`: creation prints the username and the password actually in effect (generated or from docker-compose); an existing admin that still matches the configuration is printed again; a mismatch explains why and how to fix it instead of being skipped silently.
- New `SUBBOOST_ADMIN_RESET=true`: on start, resets the existing admin to the docker-compose credentials and signs out every device; set it back to `false` after signing in.
- Documented special characters in passwords: docker compose substitutes `$` as a variable, so wrap the whole password in single quotes in `.env`, or write `$` as `$$` in docker-compose.yml; wrap values containing `#` or spaces in double quotes. The README gains a "Cannot sign in" troubleshooting table.

Upgrade note: run `docker compose pull && docker compose up -d`. Deployments that could not sign in because the password was substituted can set the correct `SUBBOOST_ADMIN_PASSWORD` plus `SUBBOOST_ADMIN_RESET=true` in `.env`, run `docker compose up -d`, and set `SUBBOOST_ADMIN_RESET` back to `false` after signing in.
