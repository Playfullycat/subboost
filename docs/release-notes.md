# SubBoost v2.14.0

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 修改管理员密码

- 后台「账户设置 → 修改密码」可以直接修改管理员密码：需要输入当前密码，新密码至少 10 位且不能与当前密码相同；15 分钟内最多尝试 5 次。
- 修改成功后，其他设备上的登录会全部失效，当前设备保持登录。
- 忘记密码时可在服务器上用命令重置，步骤见 README「管理员账号 → 忘记密码」；重置后所有设备上的旧登录都会失效。

### 文档

- README 重写：补充环境要求、分步部署、配置项、自动生成的密钥、反向代理与 HTTPS、管理员账号管理、国内网络优化、后台与服务器整体备份恢复、更新回滚卸载和常见问题。

升级提示：本版本包含一个数据库迁移（为管理员表增加会话失效时间），启动时自动执行，升级前已登录的设备不受影响。执行 `docker compose pull && docker compose up -d` 即可升级。

## English

A fork based on upstream [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0.

### Change the admin password

- Dashboard Settings → Change password now changes the admin password: it requires the current password, and the new one must be at least 10 characters and differ from the current one; 5 attempts are allowed every 15 minutes.
- After a change, every other signed-in device is logged out, and the current device stays signed in.
- If you forget the password, reset it on the server as described in README "Admin Account → Forgot the password"; the reset logs out every device.

### Documentation

- Rewrote the README with requirements, step-by-step deployment, configuration options, generated secrets, reverse proxy and HTTPS, admin account management, routing inside mainland China, dashboard and full server backup/restore, update/rollback/uninstall, and an FAQ.

Upgrade note: this release includes a database migration (a session cutoff time on the admin table) that runs automatically on start; devices signed in before the upgrade stay signed in. Upgrade with `docker compose pull && docker compose up -d`.
