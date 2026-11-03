import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalRateLimitsForTests } from "@local/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  prisma: { localAdmin: { findUnique: vi.fn(), update: vi.fn() } },
  signSession: vi.fn(async () => "fresh-session"),
}));

vi.mock("@local/lib/auth", () => ({ getCurrentAdmin: mocks.getCurrentAdmin }));
vi.mock("@local/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@local/lib/session", () => ({
  SESSION_COOKIE: "subboost_local_session",
  sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
  signSession: mocks.signSession,
}));

import { POST } from "./route";

const CURRENT = "current-password-1";
const NEXT = "brand-new-password-2";
const admin = { id: "admin-1", username: "root" };

function post(body: unknown) {
  return POST(
    new Request("https://local.test/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const valid = { currentPassword: CURRENT, newPassword: NEXT, newPasswordConfirm: NEXT };

beforeEach(async () => {
  vi.clearAllMocks();
  clearLocalRateLimitsForTests();
  mocks.getCurrentAdmin.mockResolvedValue(admin);
  mocks.prisma.localAdmin.findUnique.mockResolvedValue({ passwordHash: await bcrypt.hash(CURRENT, 4) });
});

describe("POST /api/auth/password", () => {
  it("requires an administrator", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(401);
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, currentPassword: "" }, "请输入当前密码"],
    [{ ...valid, newPassword: "short", newPasswordConfirm: "short" }, "密码至少需要 10 个字符"],
    [{ ...valid, newPasswordConfirm: "something-else-3" }, "两次输入的密码不一致，请重新确认"],
    [{ currentPassword: CURRENT, newPassword: CURRENT, newPasswordConfirm: CURRENT }, "新密码不能与当前密码相同"],
  ])("validates the request %#", async (body, message) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: message, code: "VALIDATION_ERROR" });
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("rejects a wrong current password", async () => {
    const response = await post({ ...valid, currentPassword: "wrong-password-9" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "当前密码不正确", code: "FORBIDDEN" });
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();

    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce(null);
    expect((await post(valid)).status).toBe(403);
  });

  it("stores the new hash, invalidates older sessions and renews the current one", async () => {
    const before = Date.now();
    const response = await post(valid);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const { where, data } = mocks.prisma.localAdmin.update.mock.calls[0][0];
    expect(where).toEqual({ id: "admin-1" });
    expect(await bcrypt.compare(NEXT, data.passwordHash)).toBe(true);
    expect(data.sessionsValidAfter.getMilliseconds()).toBe(0);
    expect(data.sessionsValidAfter.getTime()).toBeGreaterThan(before - 1000);
    expect(mocks.signSession).toHaveBeenCalledWith({ adminId: "admin-1", username: "root" });
    expect(response.headers.get("set-cookie")).toContain("subboost_local_session=fresh-session");
  });

  it("rate limits repeated attempts per administrator", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post({ ...valid, currentPassword: "wrong-password-9" })).status).toBe(403);
    }
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });
});
