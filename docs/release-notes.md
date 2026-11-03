# SubBoost v2.13.0

基于上游 [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0 的分支版本。

## 中文

### 国内直连与 DNS

修复开启 Clash 后部分国内服务卡顿或无法打开的问题。

- 国内域名规则（精简、完整 `cn`，以及新增的 Apple / 微软 / 谷歌 / Steam / 游戏 / 亚马逊国内专属域名）排到各海外服务规则之前，App Store、Windows 更新、Steam 国内下载等不再被抢先走代理。
- 国内 IP 规则后置到所有域名规则之后并默认解析域名，兜住不在域名列表里的国内服务，海外域名也不会提前触发本地 DNS 解析。
- 默认 DNS 改为国内外分流：国内和私有域名只查询阿里 / 腾讯 DoH；其余域名开启 `respect-rules`，经代理查询 Cloudflare / Google DoH，不再直连明文 `8.8.8.8`，并移除 fallback。
- 规则集、GeoIP / GeoSite / ASN 数据改从 jsDelivr 镜像下载，国内可直接访问。
- 已保存的订阅自动升级：未改动过的旧默认 DNS、旧默认规则集地址和旧默认的国内 IP `no-resolve` 会在生成订阅时自动换成新默认值，客户端更新订阅即可生效；自定义过的配置保持不变。

提示：新 DNS 中的 `direct-nameserver` 需要 Mihomo 1.19 及以上内核。手动调整过规则顺序的订阅，新增的国内专属规则会排在末尾，需要在规则管理中拖到前面。

### 备份与恢复

- 后台「账户设置 → 备份与恢复」可导出全部订阅（保留订阅链接 token）、模板和订阅源安全设置，可选设置密码加密。
- 导入前先预览，支持合并（按 token 更新、同名模板跳过）和覆盖（清空后导入）两种模式；数据有误时整体拒绝，不会写入任何数据。
- 备份不依赖实例的 `ENCRYPTION_KEY`，可以在不同实例之间迁移数据，导入后原订阅链接继续可用。备份不包含管理员账号，导入前需先在目标实例创建管理员。

## English

A fork based on upstream [SubBoost/subboost](https://github.com/SubBoost/subboost) v2.11.0.

### China direct routing and DNS

Fixes some China services being slow or unreachable while Clash is on.

- China domain rules (the reduced and full `cn` lists plus new China-only Apple / Microsoft / Google / Steam / games / Amazon lists) now come before foreign service rules, so App Store, Windows Update, Steam China downloads and similar traffic no longer go through the proxy.
- The China IP rule now sits after all domain rules and resolves domains by default, catching China services missing from the domain lists without letting foreign domains trigger local DNS lookups early.
- The default DNS now splits China and overseas lookups: China and private domains only use AliDNS / DNSPod DoH; everything else uses Cloudflare / Google DoH through the proxy with `respect-rules`. Plain `8.8.8.8` and fallback are removed.
- Rule sets and the GeoIP / GeoSite / ASN databases download from the jsDelivr mirror, which is reachable from mainland China.
- Saved subscriptions upgrade automatically: an untouched legacy default DNS, the old default rule set URL, and the old default China IP `no-resolve` switch to the new defaults when the subscription is generated, so clients only need to refresh. Customized settings stay as they are.

Note: `direct-nameserver` in the new DNS needs Mihomo 1.19 or newer. For subscriptions with a manually reordered rule list, the new China-only rules are appended at the end; move them up in rule management.

### Backup and restore

- Dashboard Settings → Backup & Restore exports all subscriptions (keeping their link tokens), templates and the source security setting, optionally encrypted with a password.
- Imports show a preview first and support merge (update by token, skip same-name templates) and replace (clear, then import). Invalid data rejects the whole import without writing anything.
- Backups do not depend on the instance `ENCRYPTION_KEY`, so they move data between instances and existing subscription links keep working. Backups do not include the admin account; create one on the target instance before importing.
