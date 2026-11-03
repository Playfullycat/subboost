/**
 * 国内 IP（cn-ip）规则版本。
 *
 * v2 起 cn-ip 后置到所有域名规则之后、MATCH 之前，并默认解析域名（no-resolve 默认关闭），
 * 用来兜住不在域名列表里的国内服务。旧版本把 cn-ip 放在服务规则之前，只能默认 no-resolve。
 *
 * 旧版本保存的 `cnIpNoResolve: true` 绝大多数是旧默认值，无法区分是否为用户主动选择，
 * 因此在没有 v2 标记时一次性视为未设置，回落到新默认值；保存时会写入 v2 标记。
 */
export const CN_IP_RULE_VERSION = 2;

export function readPersistedCnIpNoResolve(config: unknown): boolean | undefined {
  if (!config || typeof config !== "object") return undefined;
  const record = config as Record<string, unknown>;
  if (typeof record.cnIpNoResolve !== "boolean") return undefined;
  if (record.cnIpRuleVersion === CN_IP_RULE_VERSION) return record.cnIpNoResolve;
  return record.cnIpNoResolve ? undefined : false;
}

/** 字段缺失时使用 fallback；存在但属于旧版本默认值时回落到新默认值 false。 */
export function resolvePersistedCnIpNoResolve(config: unknown, fallback: boolean): boolean {
  const raw = config && typeof config === "object" ? (config as Record<string, unknown>).cnIpNoResolve : undefined;
  if (typeof raw !== "boolean") return fallback;
  return readPersistedCnIpNoResolve(config) ?? false;
}
