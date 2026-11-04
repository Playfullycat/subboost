import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    localAdmin: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import { bootstrapLocalAdmin, runAdminBootstrap } from "./admin-bootstrap";

function makeDb(options: { existing?: number; existingInTx?: number } = {}) {
  const tx = {
    $queryRaw: vi.fn(async () => [{ locked: false }]),
    localAdmin: {
      count: vi.fn(async () => options.existingInTx ?? 0),
      create: vi.fn(async (_args: { data: { username: string; passwordHash: string } }) => ({})),
    },
  };
  const db = {
    localAdmin: { count: vi.fn(async () => options.existing ?? 0) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { db, tx };
}

function makeLog() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const output = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((args) => args.join(" ")).join("\n");

beforeEach(() => vi.clearAllMocks());

describe("bootstrapLocalAdmin", () => {
  it("does nothing when no admin password is configured", async () => {
    const { db } = makeDb();
    await expect(bootstrapLocalAdmin({ env: {}, db: db as never, log: makeLog() })).resolves.toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(db.localAdmin.count).not.toHaveBeenCalled();
  });

  it("never touches an existing admin", async () => {
    const { db } = makeDb({ existing: 1 });
    const log = makeLog();
    await expect(
      bootstrapLocalAdmin({ env: { SUBBOOST_ADMIN_PASSWORD: "generated-password" }, db: db as never, log })
    ).resolves.toEqual({ status: "skipped", reason: "admin-exists" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(log.log).not.toHaveBeenCalled();
  });

  it("creates the default admin and prints a generated password", async () => {
    const { db, tx } = makeDb();
    const log = makeLog();
    const env = { SUBBOOST_ADMIN_PASSWORD: "  0123456789abcdef01234567  ", SUBBOOST_ADMIN_PASSWORD_SOURCE: "generated" };

    await expect(bootstrapLocalAdmin({ env, db: db as never, log })).resolves.toEqual({ status: "created", username: "admin" });

    expect(tx.$queryRaw).toHaveBeenCalled();
    const { data } = tx.localAdmin.create.mock.calls[0][0];
    expect(data.username).toBe("admin");
    expect(await bcrypt.compare("0123456789abcdef01234567", data.passwordHash)).toBe(true);
    expect(output(log.log)).toContain("用户名 Username: admin");
    expect(output(log.log)).toContain("密码   Password: 0123456789abcdef01234567");
    expect(output(log.log)).toContain("/run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD");
  });

  it("uses compose credentials without echoing the password", async () => {
    const { db, tx } = makeDb();
    const log = makeLog();
    const env = {
      SUBBOOST_ADMIN_USERNAME: " boss ",
      SUBBOOST_ADMIN_PASSWORD: "my-compose-password",
      SUBBOOST_ADMIN_PASSWORD_SOURCE: "environment",
    };

    await expect(bootstrapLocalAdmin({ env, db: db as never, log })).resolves.toEqual({ status: "created", username: "boss" });
    expect(tx.localAdmin.create.mock.calls[0][0].data.username).toBe("boss");
    expect(output(log.log)).toContain("boss");
    expect(output(log.log)).not.toContain("my-compose-password");
  });

  it("falls back to the setup link when the configured password is invalid", async () => {
    const { db } = makeDb();
    const log = makeLog();
    const env = { SUBBOOST_ADMIN_PASSWORD: "short", LOCAL_SETUP_TOKEN: "token-123", APP_URL: "https://sub.example.com/" };

    await expect(bootstrapLocalAdmin({ env, db: db as never, log })).resolves.toEqual({
      status: "invalid",
      error: "密码至少需要 10 个字符",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(output(log.warn)).toContain("https://sub.example.com/login#setup-token=token-123");

    const noToken = makeLog();
    await bootstrapLocalAdmin({ env: { SUBBOOST_ADMIN_PASSWORD: "short" }, db: db as never, log: noToken });
    expect(output(noToken.warn)).toContain("请修改 docker-compose 后重启。");
    expect(output(noToken.warn)).not.toContain("setup-token");
  });

  it("skips when another process created the admin first", async () => {
    const { db, tx } = makeDb({ existingInTx: 1 });
    const log = makeLog();
    await expect(
      bootstrapLocalAdmin({ env: { SUBBOOST_ADMIN_PASSWORD: "generated-password" }, db: db as never, log })
    ).resolves.toEqual({ status: "skipped", reason: "admin-exists" });
    expect(tx.localAdmin.create).not.toHaveBeenCalled();
    expect(log.log).not.toHaveBeenCalled();
  });

  it("defaults to process.env, the shared prisma client and console", async () => {
    vi.stubEnv("SUBBOOST_ADMIN_PASSWORD", "");
    await expect(bootstrapLocalAdmin()).resolves.toEqual({ status: "skipped", reason: "not-configured" });
    vi.unstubAllEnvs();
  });
});

describe("runAdminBootstrap", () => {
  it("logs failures instead of crashing the server", async () => {
    vi.stubEnv("SUBBOOST_ADMIN_PASSWORD", "generated-password");
    mocks.prisma.localAdmin.count.mockRejectedValueOnce(new Error("db down"));
    const log = makeLog();
    await expect(runAdminBootstrap(log)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith("[subboost] 自动创建管理员失败：", expect.any(Error));

    mocks.prisma.localAdmin.count.mockResolvedValueOnce(1);
    await runAdminBootstrap(log);
    expect(log.error).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
