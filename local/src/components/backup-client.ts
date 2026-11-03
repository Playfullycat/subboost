export type BackupImportMode = "merge" | "replace";

export type BackupImportSummary = {
  mode: BackupImportMode;
  subscriptions: { total: number; created: number; updated: number; deleted: number };
  templates: { total: number; created: number; skipped: number; deleted: number };
  settingsApplied: boolean;
  backup: { exportedAt: string; appVersion: string };
};

export const BACKUP_PASSWORD_MIN_LENGTH = 8;
const ENCRYPTED_BACKUP_SCHEMA = "subboost-backup-encrypted/v1";
const DEFAULT_FILE_NAME = "subboost-backup.json";

export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { schema?: unknown } | null;
    return parsed?.schema === ENCRYPTED_BACKUP_SCHEMA;
  } catch {
    return false;
  }
}

export function fileNameFromDisposition(header: string | null): string {
  return header?.match(/filename="([^"]+)"/)?.[1] ?? DEFAULT_FILE_NAME;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

export function formatBackupDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString();
}

export function describeImportSummary(summary: BackupImportSummary): string[] {
  const { subscriptions, templates } = summary;
  const merge = summary.mode === "merge";
  const lines = [
    merge ? "保留现有数据，只新增或更新" : `删除现有 ${subscriptions.deleted} 个订阅、${templates.deleted} 个模板`,
    `订阅：新增 ${subscriptions.created} 个${merge ? `，更新 ${subscriptions.updated} 个（token 相同）` : ""}`,
    `模板：新增 ${templates.created} 个${templates.skipped > 0 ? `，跳过同名 ${templates.skipped} 个` : ""}`,
  ];
  if (summary.settingsApplied) lines.push("订阅源安全设置：使用备份中的设置");
  return lines;
}

export async function requestBackupExport(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetchImpl("/api/backup/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(password ? { password } : {}),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "导出失败，请重试"));
  return { blob: await response.blob(), fileName: fileNameFromDisposition(response.headers.get("Content-Disposition")) };
}

export async function requestBackupImport(
  request: { file: string; mode: BackupImportMode; dryRun: boolean; password?: string },
  fetchImpl: typeof fetch = fetch
): Promise<BackupImportSummary> {
  const response = await fetchImpl("/api/backup/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "导入失败，请重试"));
  const body = (await response.json()) as { summary?: BackupImportSummary };
  if (!body.summary) throw new Error("导入响应无效");
  return body.summary;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
