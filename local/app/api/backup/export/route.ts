import { BackupFileError, serializeBackupFile } from "@subboost/server-core/backup/backup-file";
import { withCurrentAdmin } from "@local/lib/api-auth";
import { exportBackup } from "@local/lib/backup-service";
import { apiError, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";

function backupFileName(date: Date): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `subboost-backup-${stamp}.json`;
}

// POST：密码放在请求体里，避免出现在 URL、日志或浏览器历史中。
export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const body = parsedBody.value;
    const password =
      body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).password : undefined;
    if (password !== undefined && typeof password !== "string") {
      return apiError("password must be a string.", "VALIDATION_ERROR", 400);
    }

    let file: string;
    try {
      file = serializeBackupFile(await exportBackup(admin.id), password);
    } catch (error) {
      if (error instanceof BackupFileError) return apiError(error.message, "VALIDATION_ERROR", 400);
      throw error;
    }

    return new Response(file, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFileName(new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
