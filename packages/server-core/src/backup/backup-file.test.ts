import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA,
  BackupFileError,
  ENCRYPTED_BACKUP_SCHEMA,
  isEncryptedBackupFile,
  parseBackupFile,
  serializeBackupFile,
  type BackupPayload,
} from "./backup-file";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function payload(overrides: Partial<BackupPayload> = {}): BackupPayload {
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-11-04T00:00:00.000Z",
    appVersion: "2.12.0",
    settings: { allowUnsafeSubscriptionSources: true },
    subscriptions: [
      {
        name: "机场",
        token: TOKEN,
        isPrimary: true,
        autoUpdateInterval: 3600,
        urls: ["https://airport.example.com/sub?token=secret"],
        nodes: [{ name: "HK", type: "ss" }],
        config: { template: "standard" },
        subscriptionInfo: { upload: 1 },
      },
    ],
    templates: [{ name: "我的模板", description: null, config: { template: "full" } }],
    ...overrides,
  };
}

function expectBackupError(run: () => unknown, code: BackupFileError["code"]) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BackupFileError);
    expect((error as BackupFileError).code).toBe(code);
    return;
  }
  throw new Error(`expected BackupFileError ${code}`);
}

describe("backup file", () => {
  it("round-trips a plain backup", () => {
    const text = serializeBackupFile(payload());
    expect(isEncryptedBackupFile(text)).toBe(false);
    expect(parseBackupFile(text)).toEqual(payload());
  });

  it("encrypts with a password and hides secrets from the file", () => {
    const text = serializeBackupFile(payload(), "correct horse");
    expect(JSON.parse(text).schema).toBe(ENCRYPTED_BACKUP_SCHEMA);
    expect(isEncryptedBackupFile(text)).toBe(true);
    expect(text).not.toContain("airport.example.com");
    expect(text).not.toContain(TOKEN);
    expect(parseBackupFile(text, "correct horse")).toEqual(payload());
  });

  it("reports missing, wrong and weak passwords", () => {
    const text = serializeBackupFile(payload(), "correct horse");
    expectBackupError(() => parseBackupFile(text), "PASSWORD_REQUIRED");
    expectBackupError(() => parseBackupFile(text, "wrong password"), "WRONG_PASSWORD");
    expectBackupError(() => serializeBackupFile(payload(), "short"), "WEAK_PASSWORD");
  });

  it("rejects tampered ciphertext and abusive key derivation parameters", () => {
    const envelope = JSON.parse(serializeBackupFile(payload(), "correct horse"));
    const tampered = { ...envelope, data: Buffer.from("tampered").toString("base64") };
    expectBackupError(() => parseBackupFile(JSON.stringify(tampered), "correct horse"), "WRONG_PASSWORD");

    for (const kdf of [
      { ...envelope.kdf, N: 2 ** 20 },
      { ...envelope.kdf, N: 1000 },
      { ...envelope.kdf, r: 64 },
      { ...envelope.kdf, name: "pbkdf2" },
    ]) {
      expectBackupError(() => parseBackupFile(JSON.stringify({ ...envelope, kdf }), "correct horse"), "INVALID_FORMAT");
    }
  });

  it("rejects encrypted files whose plaintext is not JSON", () => {
    const envelope = JSON.parse(serializeBackupFile(payload(), "correct horse"));
    const salt = Buffer.from(envelope.kdf.salt, "base64");
    const key = scryptSync("correct horse", salt, 32, { N: envelope.kdf.N, r: envelope.kdf.r, p: envelope.kdf.p, maxmem: 64 * 1024 * 1024 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update("not json", "utf8"), cipher.final()]);
    const forged = { ...envelope, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
    expectBackupError(() => parseBackupFile(JSON.stringify(forged), "correct horse"), "INVALID_FORMAT");
    expectBackupError(() => parseBackupFile(JSON.stringify({ ...envelope, iv: "***" }), "correct horse"), "INVALID_FORMAT");
    expectBackupError(() => parseBackupFile(JSON.stringify({ ...envelope, cipher: "none" }), "correct horse"), "INVALID_FORMAT");
  });

  it("rejects files that are not valid SubBoost backups", () => {
    expect(isEncryptedBackupFile("not json")).toBe(false);
    expectBackupError(() => parseBackupFile("not json"), "INVALID_FORMAT");
    expectBackupError(() => parseBackupFile(JSON.stringify({ schema: "other" })), "INVALID_FORMAT");
    const [subscription] = payload().subscriptions;
    for (const subscriptions of [
      [{ ...subscription, token: "short" }],
      [{ ...subscription, name: " " }],
      [{ ...subscription, urls: [1] }],
      [{ ...subscription, config: [] }],
      [{ ...subscription, autoUpdateInterval: "1h" }],
      [subscription, { ...subscription, name: "副本" }],
    ]) {
      expectBackupError(() => parseBackupFile(JSON.stringify(payload({ subscriptions } as never))), "INVALID_FORMAT");
    }
    expectBackupError(
      () => parseBackupFile(JSON.stringify(payload({ templates: [{ name: "x", config: null }] } as never))),
      "INVALID_FORMAT"
    );
  });

  it("fills optional fields with safe defaults", () => {
    const [subscription] = payload().subscriptions;
    const parsed = parseBackupFile(
      JSON.stringify({
        schema: BACKUP_SCHEMA,
        subscriptions: [{ ...subscription, isPrimary: undefined, autoUpdateInterval: undefined, subscriptionInfo: null }],
        templates: [{ name: "t", description: 1, config: {} }],
      })
    );
    expect(parsed.settings).toEqual({ allowUnsafeSubscriptionSources: false });
    expect(parsed.subscriptions[0]).toMatchObject({ isPrimary: false, autoUpdateInterval: null, subscriptionInfo: {} });
    expect(parsed.templates[0].description).toBeNull();
  });
});
