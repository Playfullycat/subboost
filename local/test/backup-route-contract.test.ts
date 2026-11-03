import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import { exportBackup, importBackup } from "@local/lib/backup-service";
import { serializeBackupFile, type BackupPayload } from "@subboost/server-core/backup/backup-file";
import * as exportRoute from "../app/api/backup/export/route";
import * as importRoute from "../app/api/backup/import/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/backup-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@local/lib/backup-service")>();
  return { ...actual, exportBackup: vi.fn(), importBackup: vi.fn() };
});

const admin = { id: "admin-1", username: "root" };
const payload: BackupPayload = {
  schema: "subboost-backup/v1",
  exportedAt: "2026-11-04T00:00:00.000Z",
  appVersion: "2.12.0",
  settings: { allowUnsafeSubscriptionSources: false },
  subscriptions: [],
  templates: [],
};
const summary = {
  mode: "merge",
  subscriptions: { total: 0, created: 0, updated: 0, deleted: 0 },
  templates: { total: 0, created: 0, skipped: 0, deleted: 0 },
  settingsApplied: false,
  backup: { exportedAt: payload.exportedAt, appVersion: payload.appVersion },
};

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const exportUrl = "https://local.test/api/backup/export";
const importUrl = "https://local.test/api/backup/import";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
  vi.mocked(exportBackup).mockResolvedValue(payload);
  vi.mocked(importBackup).mockResolvedValue(summary as never);
});

describe("backup export route", () => {
  it("requires an administrator", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);
    expect((await exportRoute.POST(post(exportUrl, {}))).status).toBe(401);
    expect((await importRoute.POST(post(importUrl, {}))).status).toBe(401);
    expect(exportBackup).not.toHaveBeenCalled();
  });

  it("downloads a plain or encrypted backup file", async () => {
    const plain = await exportRoute.POST(post(exportUrl, {}));
    expect(plain.status).toBe(200);
    expect(plain.headers.get("Content-Disposition")).toMatch(/^attachment; filename="subboost-backup-\d{8}-\d{6}\.json"$/);
    expect(plain.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(await plain.text())).toEqual(payload);
    expect(exportBackup).toHaveBeenCalledWith("admin-1");

    const encrypted = await exportRoute.POST(post(exportUrl, { password: "long-enough" }));
    expect(JSON.parse(await encrypted.text()).schema).toBe("subboost-backup-encrypted/v1");
  });

  it("validates the password", async () => {
    expect((await exportRoute.POST(post(exportUrl, { password: 1 }))).status).toBe(400);
    const weak = await exportRoute.POST(post(exportUrl, { password: "short" }));
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await exportRoute.POST(post(exportUrl, "not json"))).status).toBe(400);
  });

  it("rethrows unexpected failures", async () => {
    vi.mocked(exportBackup).mockRejectedValue(new Error("database down"));
    await expect(exportRoute.POST(post(exportUrl, []))).rejects.toThrow("database down");
  });
});

describe("backup import route", () => {
  it("previews and imports parsed backups", async () => {
    const file = serializeBackupFile(payload);
    const preview = await importRoute.POST(post(importUrl, { file, mode: "merge", dryRun: true }));
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ dryRun: true, summary });
    expect(importBackup).toHaveBeenLastCalledWith("admin-1", payload, "merge", { dryRun: true });

    const applied = await importRoute.POST(post(importUrl, { file, mode: "replace" }));
    expect(await applied.json()).toMatchObject({ dryRun: false });
    expect(importBackup).toHaveBeenLastCalledWith("admin-1", payload, "replace", { dryRun: false });
  });

  it("decrypts password-protected backups", async () => {
    const file = serializeBackupFile(payload, "backup-password");
    expect((await importRoute.POST(post(importUrl, { file, mode: "merge", password: "backup-password" }))).status).toBe(200);

    const missing = await importRoute.POST(post(importUrl, { file, mode: "merge" }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: "PASSWORD_REQUIRED" });

    const wrong = await importRoute.POST(post(importUrl, { file, mode: "merge", password: "nope-nope" }));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toMatchObject({ code: "WRONG_PASSWORD" });
  });

  it("validates the request body", async () => {
    for (const body of [
      [],
      { mode: "merge" },
      { file: "  ", mode: "merge" },
      { file: "{}", mode: "merge", password: 1 },
      { file: "{}", mode: "overwrite" },
    ]) {
      expect((await importRoute.POST(post(importUrl, body))).status).toBe(400);
    }
    expect((await importRoute.POST(post(importUrl, "not json"))).status).toBe(400);
    expect(importBackup).not.toHaveBeenCalled();
  });

  it("maps import validation errors and rethrows unexpected failures", async () => {
    const { BackupImportError } = await import("@local/lib/backup-service");
    const file = serializeBackupFile(payload);
    vi.mocked(importBackup).mockRejectedValueOnce(new BackupImportError("第 1 个订阅「A」无效"));
    const invalid = await importRoute.POST(post(importUrl, { file, mode: "merge" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "第 1 个订阅「A」无效", code: "VALIDATION_ERROR" });

    vi.mocked(importBackup).mockRejectedValueOnce(new Error("database down"));
    await expect(importRoute.POST(post(importUrl, { file, mode: "merge" }))).rejects.toThrow("database down");
  });
});
