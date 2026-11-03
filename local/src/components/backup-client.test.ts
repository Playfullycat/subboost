import { describe, expect, it, vi } from "vitest";
import {
  describeImportSummary,
  errorMessage,
  fileNameFromDisposition,
  formatBackupDate,
  isEncryptedBackup,
  requestBackupExport,
  requestBackupImport,
  type BackupImportSummary,
} from "./backup-client";

function summary(overrides: Partial<BackupImportSummary> = {}): BackupImportSummary {
  return {
    mode: "merge",
    subscriptions: { total: 3, created: 1, updated: 2, deleted: 0 },
    templates: { total: 2, created: 1, skipped: 1, deleted: 0 },
    settingsApplied: false,
    backup: { exportedAt: "2026-11-04T00:00:00.000Z", appVersion: "2.12.0" },
    ...overrides,
  };
}

function response(init: { ok?: boolean; body?: unknown; blob?: Blob; disposition?: string | null }) {
  return {
    ok: init.ok ?? true,
    json: vi.fn(async () => {
      if (init.body === undefined) throw new Error("no json");
      return init.body;
    }),
    blob: vi.fn(async () => init.blob ?? new Blob(["{}"])),
    headers: new Headers(init.disposition ? { "Content-Disposition": init.disposition } : {}),
  } as unknown as Response;
}

describe("backup client helpers", () => {
  it("detects encrypted backups", () => {
    expect(isEncryptedBackup(JSON.stringify({ schema: "subboost-backup-encrypted/v1" }))).toBe(true);
    expect(isEncryptedBackup(JSON.stringify({ schema: "subboost-backup/v1" }))).toBe(false);
    expect(isEncryptedBackup("null")).toBe(false);
    expect(isEncryptedBackup("not json")).toBe(false);
  });

  it("reads file names, dates and error messages", () => {
    expect(fileNameFromDisposition('attachment; filename="subboost-backup-1.json"')).toBe("subboost-backup-1.json");
    expect(fileNameFromDisposition(null)).toBe("subboost-backup.json");
    expect(formatBackupDate("not a date")).toBe("未知");
    expect(formatBackupDate("2026-11-04T00:00:00.000Z")).not.toBe("未知");
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage("nope", "fallback")).toBe("fallback");
  });

  it("describes merge and replace previews", () => {
    expect(describeImportSummary(summary())).toEqual([
      "保留现有数据，只新增或更新",
      "订阅：新增 1 个，更新 2 个（token 相同）",
      "模板：新增 1 个，跳过同名 1 个",
    ]);
    expect(
      describeImportSummary(
        summary({
          mode: "replace",
          subscriptions: { total: 3, created: 3, updated: 0, deleted: 4 },
          templates: { total: 2, created: 2, skipped: 0, deleted: 5 },
          settingsApplied: true,
        })
      )
    ).toEqual(["删除现有 4 个订阅、5 个模板", "订阅：新增 3 个", "模板：新增 2 个", "订阅源安全设置：使用备份中的设置"]);
  });
});

describe("backup client requests", () => {
  it("exports with and without a password", async () => {
    const blob = new Blob(["backup"]);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      response({ blob, disposition: 'attachment; filename="a.json"' })
    );
    const sentBody = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

    await expect(requestBackupExport("secret-password", fetchMock)).resolves.toEqual({ blob, fileName: "a.json" });
    expect(sentBody(0)).toEqual({ password: "secret-password" });
    await requestBackupExport("", fetchMock);
    expect(sentBody(1)).toEqual({});
  });

  it("surfaces export errors", async () => {
    await expect(requestBackupExport("", async () => response({ ok: false, body: { error: "太短" } }))).rejects.toThrow("太短");
    await expect(requestBackupExport("", async () => response({ ok: false }))).rejects.toThrow("导出失败，请重试");
  });

  it("imports and validates the response", async () => {
    const fetchMock = vi.fn(async () => response({ body: { summary: summary() } }));
    const request = { file: "{}", mode: "merge" as const, dryRun: true };

    await expect(requestBackupImport(request, fetchMock)).resolves.toEqual(summary());
    expect(fetchMock).toHaveBeenCalledWith("/api/backup/import", expect.objectContaining({ method: "POST", body: JSON.stringify(request) }));
    await expect(requestBackupImport(request, async () => response({ body: {} }))).rejects.toThrow("导入响应无效");
    await expect(requestBackupImport(request, async () => response({ ok: false, body: { error: "备份密码错误" } }))).rejects.toThrow(
      "备份密码错误"
    );
    await expect(requestBackupImport(request, async () => response({ ok: false, body: { error: 1 } }))).rejects.toThrow(
      "导入失败，请重试"
    );
  });
});
