import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * SubBoost 备份文件格式。
 *
 * 备份内容是解密后的业务数据（不含实例密钥），因此可以导入任意实例，
 * 导入时由目标实例用自己的 ENCRYPTION_KEY 重新加密入库。
 * 设置了密码时，整个 JSON 用 scrypt 派生的密钥做 AES-256-GCM 加密。
 */
export const BACKUP_SCHEMA = "subboost-backup/v1";
export const ENCRYPTED_BACKUP_SCHEMA = "subboost-backup-encrypted/v1";
export const BACKUP_PASSWORD_MIN_LENGTH = 8;

const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const SCRYPT_MAX_N = 2 ** 17;
const SCRYPT_MAX_R = 8;
const SCRYPT_MAX_P = 4;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type BackupSubscription = {
  name: string;
  token: string;
  isPrimary: boolean;
  autoUpdateInterval: number | null;
  urls: string[];
  nodes: unknown[];
  config: Record<string, unknown>;
  subscriptionInfo: Record<string, unknown>;
};

export type BackupTemplate = {
  name: string;
  description: string | null;
  config: Record<string, unknown>;
};

export type BackupPayload = {
  schema: typeof BACKUP_SCHEMA;
  exportedAt: string;
  appVersion: string;
  settings: { allowUnsafeSubscriptionSources: boolean };
  subscriptions: BackupSubscription[];
  templates: BackupTemplate[];
};

export type BackupFileErrorCode = "INVALID_FORMAT" | "PASSWORD_REQUIRED" | "WRONG_PASSWORD" | "WEAK_PASSWORD";

export class BackupFileError extends Error {
  constructor(
    readonly code: BackupFileErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackupFileError";
  }
}

type EncryptedBackupEnvelope = {
  schema: typeof ENCRYPTED_BACKUP_SCHEMA;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new BackupFileError("INVALID_FORMAT", message);
}

function deriveKey(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { ...params, maxmem: 256 * params.N * params.r });
}

function readBase64(value: unknown, field: string, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) invalid(`备份文件字段 ${field} 无效。`);
  const buffer = Buffer.from(value, "base64");
  if (expectedLength !== undefined && buffer.length !== expectedLength) invalid(`备份文件字段 ${field} 长度无效。`);
  return buffer;
}

function readScryptParams(kdf: Record<string, unknown>) {
  const { N, r, p } = kdf;
  const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
  if (
    kdf.name !== "scrypt" ||
    !isPositiveInteger(N) ||
    !isPositiveInteger(r) ||
    !isPositiveInteger(p) ||
    N > SCRYPT_MAX_N ||
    (N & (N - 1)) !== 0 ||
    r > SCRYPT_MAX_R ||
    p > SCRYPT_MAX_P
  ) {
    invalid("备份文件的加密参数无效。");
  }
  return { N, r, p };
}

function encryptPayload(json: string, password: string): EncryptedBackupEnvelope {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt, SCRYPT_PARAMS), iv);
  const data = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  return {
    schema: ENCRYPTED_BACKUP_SCHEMA,
    kdf: { name: "scrypt", ...SCRYPT_PARAMS, salt: salt.toString("base64") },
    cipher: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptPayload(envelope: Record<string, unknown>, password: string): string {
  if (!isRecord(envelope.kdf) || envelope.cipher !== "aes-256-gcm") invalid("备份文件的加密参数无效。");
  const params = readScryptParams(envelope.kdf);
  const salt = readBase64(envelope.kdf.salt, "kdf.salt", SALT_LENGTH);
  const iv = readBase64(envelope.iv, "iv", IV_LENGTH);
  const tag = readBase64(envelope.tag, "tag", TAG_LENGTH);
  const data = readBase64(envelope.data, "data");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, salt, params), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new BackupFileError("WRONG_PASSWORD", "备份密码错误，或文件已损坏。");
  }
}

function readSubscription(value: unknown, index: number): BackupSubscription {
  const label = `第 ${index + 1} 个订阅`;
  if (!isRecord(value)) invalid(`${label}格式无效。`);
  if (typeof value.name !== "string" || !value.name.trim()) invalid(`${label}缺少名称。`);
  if (typeof value.token !== "string" || !TOKEN_PATTERN.test(value.token)) invalid(`${label}的订阅 token 无效。`);
  if (!Array.isArray(value.urls) || !value.urls.every((url) => typeof url === "string")) invalid(`${label}的订阅链接无效。`);
  if (!Array.isArray(value.nodes)) invalid(`${label}的节点列表无效。`);
  if (!isRecord(value.config)) invalid(`${label}的配置无效。`);
  const interval = value.autoUpdateInterval;
  if (interval !== null && interval !== undefined && !(typeof interval === "number" && Number.isFinite(interval))) {
    invalid(`${label}的自动更新间隔无效。`);
  }
  return {
    name: value.name,
    token: value.token,
    isPrimary: value.isPrimary === true,
    autoUpdateInterval: typeof interval === "number" ? interval : null,
    urls: value.urls as string[],
    nodes: value.nodes,
    config: value.config,
    subscriptionInfo: isRecord(value.subscriptionInfo) ? value.subscriptionInfo : {},
  };
}

function readTemplate(value: unknown, index: number): BackupTemplate {
  const label = `第 ${index + 1} 个模板`;
  if (!isRecord(value)) invalid(`${label}格式无效。`);
  if (typeof value.name !== "string" || !value.name.trim()) invalid(`${label}缺少名称。`);
  if (!isRecord(value.config)) invalid(`${label}的配置无效。`);
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    config: value.config,
  };
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!isRecord(value) || value.schema !== BACKUP_SCHEMA) invalid("不是 SubBoost 备份文件，或备份版本不受支持。");
  if (!Array.isArray(value.subscriptions) || !Array.isArray(value.templates)) invalid("备份文件缺少订阅或模板列表。");
  const subscriptions = value.subscriptions.map(readSubscription);
  const tokens = new Set<string>();
  for (const subscription of subscriptions) {
    if (tokens.has(subscription.token)) invalid(`订阅 token 重复：${subscription.name}`);
    tokens.add(subscription.token);
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    appVersion: typeof value.appVersion === "string" ? value.appVersion : "",
    settings: { allowUnsafeSubscriptionSources: settings.allowUnsafeSubscriptionSources === true },
    subscriptions,
    templates: value.templates.map(readTemplate),
  };
}

export function serializeBackupFile(payload: BackupPayload, password?: string): string {
  const json = JSON.stringify(payload, null, 2);
  if (password === undefined || password === "") return json;
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) {
    throw new BackupFileError("WEAK_PASSWORD", `备份密码至少 ${BACKUP_PASSWORD_MIN_LENGTH} 位。`);
  }
  return JSON.stringify(encryptPayload(json, password), null, 2);
}

export function isEncryptedBackupFile(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) && parsed.schema === ENCRYPTED_BACKUP_SCHEMA;
  } catch {
    return false;
  }
}

export function parseBackupFile(text: string, password?: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid("备份文件不是有效的 JSON。");
  }
  if (isRecord(parsed) && parsed.schema === ENCRYPTED_BACKUP_SCHEMA) {
    if (!password) throw new BackupFileError("PASSWORD_REQUIRED", "这个备份文件已加密，请输入备份密码。");
    const json = decryptPayload(parsed, password);
    try {
      parsed = JSON.parse(json);
    } catch {
      invalid("备份文件解密后不是有效的 JSON。");
    }
  }
  return validateBackupPayload(parsed);
}
