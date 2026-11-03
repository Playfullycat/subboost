import { BackupFileError, parseBackupFile } from "@subboost/server-core/backup/backup-file";
import { withCurrentAdmin } from "@local/lib/api-auth";
import { BackupImportError, importBackup, type BackupImportMode } from "@local/lib/backup-service";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";

const MODES = new Set<BackupImportMode>(["merge", "replace"]);

/**
 * body: { file: 备份文件文本, password?: 备份密码, mode: "merge" | "replace", dryRun?: boolean }
 * dryRun 只校验并返回导入预览，不写库。
 */
export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.backup);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid request body.", "VALIDATION_ERROR", 400);
    }
    const { file, password, mode, dryRun } = body as Record<string, unknown>;
    if (typeof file !== "string" || !file.trim()) return apiError("请选择备份文件。", "VALIDATION_ERROR", 400);
    if (password !== undefined && typeof password !== "string") {
      return apiError("password must be a string.", "VALIDATION_ERROR", 400);
    }
    if (typeof mode !== "string" || !MODES.has(mode as BackupImportMode)) {
      return apiError("mode must be merge or replace.", "VALIDATION_ERROR", 400);
    }

    try {
      const payload = parseBackupFile(file, password);
      const summary = await importBackup(admin.id, payload, mode as BackupImportMode, { dryRun: dryRun === true });
      return json({ dryRun: dryRun === true, summary });
    } catch (error) {
      if (error instanceof BackupFileError) {
        return json({ error: error.message, code: error.code }, error.code === "WRONG_PASSWORD" ? 403 : 400);
      }
      if (error instanceof BackupImportError) return apiError(error.message, "VALIDATION_ERROR", 400);
      throw error;
    }
  });
}
