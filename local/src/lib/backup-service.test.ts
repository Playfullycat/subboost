import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultSubBoostTemplateConfig } from "@subboost/core/config/defaults";
import { parseBackupFile, serializeBackupFile, type BackupPayload } from "@subboost/server-core/backup/backup-file";

const mocks = vi.hoisted(() => {
  const tx = {
    subscription: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    localTemplate: { deleteMany: vi.fn(), createMany: vi.fn() },
    localAdmin: { update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      localAdmin: { findUnique: vi.fn() },
      subscription: { findMany: vi.fn(), count: vi.fn() },
      localTemplate: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

const { decryptJson, encryptJson } = await import("./crypto");
const { BackupImportError, exportBackup, importBackup } = await import("./backup-service");

const OWNER = "admin-1";
const TOKEN_A = "tokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_B = "tokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const node = { name: "HK", type: "ss", server: "ss.example.com", port: 8388, cipher: "aes-128-gcm", password: "secret" };

function subscriptionRow(token: string, name: string) {
  return {
    id: `id-${name}`,
    ownerId: OWNER,
    name,
    token,
    isPrimary: token === TOKEN_A,
    encryptedUrls: encryptJson(["https://airport.example.com/sub"]),
    encryptedNodes: encryptJson([node]),
    encryptedConfig: encryptJson({ template: "standard", smartNodeMatchingEnabled: false }),
    encryptedSubscriptionInfo: encryptJson({}),
    autoUpdateInterval: 7200,
    cacheExpiresAt: null,
    lastAccessedAt: null,
    lastUpdatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function backup(overrides: Partial<BackupPayload> = {}): BackupPayload {
  return {
    schema: "subboost-backup/v1",
    exportedAt: "2026-11-04T00:00:00.000Z",
    appVersion: "2.12.0",
    settings: { allowUnsafeSubscriptionSources: true },
    subscriptions: [
      { name: "A", token: TOKEN_A, isPrimary: true, autoUpdateInterval: 7200, urls: ["https://a.example.com/sub"], nodes: [], config: {}, subscriptionInfo: {} },
      { name: "B", token: TOKEN_B, isPrimary: false, autoUpdateInterval: null, urls: [], nodes: [node], config: {}, subscriptionInfo: {} },
    ],
    templates: [
      { name: "Existing", description: null, config: buildDefaultSubBoostTemplateConfig("minimal") },
      { name: "New", description: "desc", config: buildDefaultSubBoostTemplateConfig("full") },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", "backup-test-encryption-key");
  vi.stubEnv("APP_URL", "https://sub.example.com");
  for (const group of [mocks.tx.subscription, mocks.tx.localTemplate, mocks.tx.localAdmin]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  mocks.prisma.$transaction.mockClear();
  mocks.prisma.subscription.findMany.mockResolvedValue([{ id: "id-A", token: TOKEN_A, ownerId: OWNER }]);
  mocks.prisma.localTemplate.findMany.mockResolvedValue([{ name: "Existing" }]);
  mocks.prisma.subscription.count.mockResolvedValue(3);
  mocks.prisma.localTemplate.count.mockResolvedValue(2);
});

describe("exportBackup", () => {
  it("exports decrypted subscriptions, templates and settings", async () => {
    mocks.prisma.localAdmin.findUnique.mockResolvedValue({ allowUnsafeSubscriptionSources: true });
    mocks.prisma.subscription.findMany.mockResolvedValue([subscriptionRow(TOKEN_A, "A")]);
    mocks.prisma.localTemplate.findMany.mockResolvedValue([
      { id: "t1", ownerId: OWNER, name: "T", description: null, encryptedConfig: encryptJson({ template: "full" }) },
    ]);

    const result = await exportBackup(OWNER);

    expect(result).toMatchObject({
      schema: "subboost-backup/v1",
      settings: { allowUnsafeSubscriptionSources: true },
      subscriptions: [
        {
          name: "A",
          token: TOKEN_A,
          isPrimary: true,
          autoUpdateInterval: 7200,
          urls: ["https://airport.example.com/sub"],
          nodes: [node],
          config: { template: "standard", smartNodeMatchingEnabled: false },
        },
      ],
      templates: [{ name: "T", description: null, config: { template: "full" } }],
    });
    expect(mocks.prisma.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: OWNER } }));
  });
});

describe("importBackup", () => {
  it("previews a merge without writing", async () => {
    const summary = await importBackup(OWNER, backup(), "merge", { dryRun: true });

    expect(summary).toMatchObject({
      mode: "merge",
      subscriptions: { total: 2, created: 1, updated: 1, deleted: 0 },
      templates: { total: 2, created: 1, skipped: 1, deleted: 0 },
      settingsApplied: false,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("merges by token, keeps tokens and skips existing template names", async () => {
    await importBackup(OWNER, backup(), "merge");

    expect(mocks.tx.subscription.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.localAdmin.update).not.toHaveBeenCalled();
    expect(mocks.tx.subscription.update).toHaveBeenCalledWith({
      where: { token: TOKEN_A },
      data: expect.objectContaining({ name: "A", token: TOKEN_A, isPrimary: true, autoUpdateInterval: 7200, cacheExpiresAt: null }),
    });
    const created = mocks.tx.subscription.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ ownerId: OWNER, name: "B", token: TOKEN_B, isPrimary: false });
    expect(decryptJson(created.encryptedNodes, [])).toEqual([node]);
    expect(mocks.tx.localTemplate.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ownerId: OWNER, name: "New", description: "desc" })],
    });
  });

  it("replaces all owned data and applies settings", async () => {
    const summary = await importBackup(OWNER, backup(), "replace");

    expect(summary).toMatchObject({
      subscriptions: { created: 2, updated: 0, deleted: 3 },
      templates: { created: 2, skipped: 0, deleted: 2 },
      settingsApplied: true,
    });
    expect(mocks.tx.subscription.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER } });
    expect(mocks.tx.localTemplate.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER } });
    expect(mocks.tx.localAdmin.update).toHaveBeenCalledWith({
      where: { id: OWNER },
      data: { allowUnsafeSubscriptionSources: true },
    });
    expect(mocks.tx.subscription.create).toHaveBeenCalledTimes(2);
    expect(mocks.tx.subscription.update).not.toHaveBeenCalled();
  });

  it("validates every record before writing anything", async () => {
    const invalid = backup({
      subscriptions: [{ ...backup().subscriptions[0], urls: [], nodes: [] }],
    });

    await expect(importBackup(OWNER, invalid, "replace")).rejects.toThrow(BackupImportError);
    await expect(importBackup(OWNER, invalid, "replace")).rejects.toThrow("第 1 个订阅「A」无效");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses tokens owned by another account", async () => {
    mocks.prisma.subscription.findMany.mockResolvedValue([{ id: "x", token: TOKEN_A, ownerId: "someone-else" }]);
    await expect(importBackup(OWNER, backup(), "merge")).rejects.toThrow("已被其他账号占用");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("round-trips an encrypted export into a replace import", async () => {
    mocks.prisma.localAdmin.findUnique.mockResolvedValue({ allowUnsafeSubscriptionSources: false });
    mocks.prisma.subscription.findMany.mockResolvedValueOnce([subscriptionRow(TOKEN_A, "A"), subscriptionRow(TOKEN_B, "B")]);
    mocks.prisma.localTemplate.findMany.mockResolvedValueOnce([]);
    const file = serializeBackupFile(await exportBackup(OWNER), "backup-password");

    vi.stubEnv("ENCRYPTION_KEY", "a-different-instance-key");
    await importBackup(OWNER, parseBackupFile(file, "backup-password"), "replace");

    const rows = mocks.tx.subscription.create.mock.calls.map(([{ data }]) => data);
    expect(rows.map((row) => row.token)).toEqual([TOKEN_A, TOKEN_B]);
    expect(decryptJson(rows[0].encryptedUrls, [])).toEqual(["https://airport.example.com/sub"]);
    expect(decryptJson<Record<string, unknown>>(rows[0].encryptedConfig, {})).toMatchObject({ smartNodeMatchingEnabled: false });
  });
});
