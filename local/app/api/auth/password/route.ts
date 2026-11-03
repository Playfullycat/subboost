import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { withCurrentAdmin } from "@local/lib/api-auth";
import { getLocalAdminPasswordChangeError, LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { consumeLocalRateLimit, localRateLimitResponse, resetLocalRateLimit } from "@local/lib/rate-limit";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";

const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_CHANGE_LIMIT = 5;

/** JWT 的签发时间精确到秒；取整到秒，保证本次新签发的会话不早于失效时间。 */
function currentSecond(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/**
 * 修改管理员密码：需要验证当前密码；成功后其他设备上的登录全部失效，当前设备换发新会话。
 */
export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    // 按管理员限流，防止拿到会话后暴力猜测当前密码。
    const limit = consumeLocalRateLimit("auth-password-change", admin.id, {
      limit: PASSWORD_CHANGE_LIMIT,
      windowMs: PASSWORD_CHANGE_WINDOW_MS,
    });
    if (!limit.allowed) {
      return localRateLimitResponse("Too many password change attempts. Try again later.", limit.retryAfterSeconds);
    }

    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody, LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson);
    const body = parsedBody.value;
    const currentPassword = getStringField(body, "currentPassword");
    const newPassword = getStringField(body, "newPassword");
    const newPasswordConfirm = getStringField(body, "newPasswordConfirm");

    const credentialError = getLocalAdminPasswordChangeError({ currentPassword, newPassword, newPasswordConfirm });
    if (credentialError) return apiError(credentialError, "VALIDATION_ERROR", 400);

    const record = await prisma.localAdmin.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
    if (!record || !(await bcrypt.compare(currentPassword, record.passwordHash))) {
      return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.currentPasswordInvalid, "FORBIDDEN", 403);
    }

    await prisma.localAdmin.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), sessionsValidAfter: currentSecond() },
    });
    resetLocalRateLimit("auth-password-change", admin.id);

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
    return response;
  });
}
