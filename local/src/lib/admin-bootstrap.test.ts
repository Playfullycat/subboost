import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    localAdmin: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import { bootstrapLocalAdmin, runAdminBootstrap } from "./admin-bootstrap";

type Admin = { id: string; username: string; passwordHash: string };

function makeDb(options: { existing?: Admin | null; createdByOtherProcess?: Admin } = {}) {
  let current: Admin | null = options.existing ?? null;
  const tx = {
    $queryRaw: vi.fn(async () => [{ locked: false }]),
    localAdmin: {
      count: vi.fn(async () => {
        if (options.createdByOtherProcess && !current) current = options.createdByOtherProcess;
        return current ? 1 : 0;
      }),
      create: vi.fn(async ({ data }: { data: { username: string; passwordHash: string } }) => {
        current = { id: "admin-1", ...data };
        return current;
      }),
    },
  };
  const db = {
    localAdmin: {
      findFirst: vi.fn(async () => current),
      update: vi.fn(async (_args: { where: { id: string }; data: { username: string; passwordHash: string; sessionsValidAfter: Date } }) => ({})),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { db, tx };
}

async function admin(username: string, password: string): Promise<Admin> {
  return { id: "admin-1", username, passwordHash: await bcrypt.hash(password, 4) };
}

function makeLog() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const output = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((args) => args.join(" ")).join("\n");
const GENERATED = { SUBBOOST_ADMIN_PASSWORD: "0123456789abcdef01234567", SUBBOOST_ADMIN_PASSWORD_SOURCE: "generated" };
const CUSTOM = { SUBBOOST_ADMIN_USERNAME: " boss ", SUBBOOST_ADMIN_PASSWORD: "my-compose-password", SUBBOOST_ADMIN_PASSWORD_SOURCE: "environment" };

beforeEach(() => vi.clearAllMocks());

describe("bootstrapLocalAdmin", () => {
  it("does nothing when no admin password is configured", async () => {
    const { db } = makeDb();
    await expect(bootstrapLocalAdmin({ env: {}, db: db as never, log: makeLog() })).resolves.toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(db.localAdmin.findFirst).not.toHaveBeenCalled();
  });

  it("creates the default admin and prints the generated credentials", async () => {
    const { db, tx } = makeDb();
    const log = makeLog();
    const env = { ...GENERATED, SUBBOOST_ADMIN_PASSWORD: `  ${GENERATED.SUBBOOST_ADMIN_PASSWORD}  ` };

    await expect(bootstrapLocalAdmin({ env, db: db as never, log })).resolves.toEqual({ status: "created", username: "admin" });

    expect(tx.$queryRaw).toHaveBeenCalled();
    const { data } = tx.localAdmin.create.mock.calls[0][0];
    expect(await bcrypt.compare(GENERATED.SUBBOOST_ADMIN_PASSWORD, data.passwordHash)).toBe(true);
    expect(output(log.log)).toContain("用户名 Username: admin");
    expect(output(log.log)).toContain(`密码   Password: ${GENERATED.SUBBOOST_ADMIN_PASSWORD}`);
    expect(output(log.log)).toContain("自动生成 / generated");
    expect(output(log.log)).toContain("/run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD");
  });

  it("creates the admin from compose credentials and prints them too", async () => {
    const { db, tx } = makeDb();
    const log = makeLog();
    await expect(bootstrapLocalAdmin({ env: CUSTOM, db: db as never, log })).resolves.toEqual({ status: "created", username: "boss" });
    expect(tx.localAdmin.create.mock.calls[0][0].data.username).toBe("boss");
    expect(output(log.log)).toContain("用户名 Username: boss");
    expect(output(log.log)).toContain("密码   Password: my-compose-password");
    expect(output(log.log)).toContain("docker-compose 设置 / from docker-compose");
    expect(output(log.log)).toContain("$ 需写成 $$");
  });

  it("prints the credentials again on later starts when they still match", async () => {
    const { db } = makeDb({ existing: await admin("boss", "my-compose-password") });
    const log = makeLog();
    await expect(bootstrapLocalAdmin({ env: CUSTOM, db: db as never, log })).resolves.toEqual({
      status: "exists",
      username: "boss",
      matches: true,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.localAdmin.update).not.toHaveBeenCalled();
    expect(output(log.log)).toContain("密码   Password: my-compose-password");
  });

  it("explains a mismatch with an existing admin instead of staying silent", async () => {
    const { db } = makeDb({ existing: await admin("admin", "First-Pass-123") });
    const log = makeLog();
    await expect(bootstrapLocalAdmin({ env: CUSTOM, db: db as never, log })).resolves.toEqual({
      status: "exists",
      username: "admin",
      matches: false,
    });
    expect(db.localAdmin.update).not.toHaveBeenCalled();
    expect(log.log).not.toHaveBeenCalled();
    expect(output(log.warn)).toContain("管理员账号已存在：admin");
    expect(output(log.warn)).toContain("SUBBOOST_ADMIN_RESET=true");
    expect(output(log.warn)).not.toContain("my-compose-password");
  });

  it("resets the existing admin to the compose credentials when asked", async () => {
    const { db } = makeDb({ existing: await admin("admin", "First-Pass-123") });
    const log = makeLog();
    await expect(
      bootstrapLocalAdmin({ env: { ...CUSTOM, SUBBOOST_ADMIN_RESET: " TRUE " }, db: db as never, log })
    ).resolves.toEqual({ status: "reset", username: "boss" });

    const { where, data } = db.localAdmin.update.mock.calls[0][0];
    expect(where).toEqual({ id: "admin-1" });
    expect(data.username).toBe("boss");
    expect(await bcrypt.compare("my-compose-password", data.passwordHash)).toBe(true);
    expect(data.sessionsValidAfter).toBeInstanceOf(Date);
    expect(output(log.log)).toContain("已重置管理员账号密码");
    expect(output(log.warn)).toContain("SUBBOOST_ADMIN_RESET 仍处于开启状态");
  });

  it("does not touch sessions when a reset is requested but nothing differs", async () => {
    const { db } = makeDb({ existing: await admin("boss", "my-compose-password") });
    const log = makeLog();
    await expect(
      bootstrapLocalAdmin({ env: { ...CUSTOM, SUBBOOST_ADMIN_RESET: "1" }, db: db as never, log })
    ).resolves.toEqual({ status: "reset", username: "boss" });
    expect(db.localAdmin.update).not.toHaveBeenCalled();
    expect(output(log.log)).toContain("无需重置");
  });

  it("rejects invalid credentials, pointing at the setup link only when no admin exists", async () => {
    const env = { SUBBOOST_ADMIN_PASSWORD: "Pa-12345", LOCAL_SETUP_TOKEN: "token-123", APP_URL: "https://sub.example.com/" };
    const fresh = makeDb();
    const log = makeLog();
    await expect(bootstrapLocalAdmin({ env, db: fresh.db as never, log })).resolves.toEqual({
      status: "invalid",
      error: "密码至少需要 10 个字符",
    });
    expect(fresh.db.$transaction).not.toHaveBeenCalled();
    expect(output(log.warn)).toContain("https://sub.example.com/login#setup-token=token-123");
    expect(output(log.warn)).toContain("$ 需写成 $$");

    const withAdmin = makeDb({ existing: await admin("admin", "First-Pass-123") });
    const adminLog = makeLog();
    await bootstrapLocalAdmin({ env: { ...env, SUBBOOST_ADMIN_RESET: "true" }, db: withAdmin.db as never, log: adminLog });
    expect(withAdmin.db.localAdmin.update).not.toHaveBeenCalled();
    expect(output(adminLog.warn)).toContain("未修改已有管理员 admin");
    expect(output(adminLog.warn)).not.toContain("setup-token");

    const noToken = makeLog();
    await bootstrapLocalAdmin({ env: { SUBBOOST_ADMIN_PASSWORD: "short" }, db: makeDb().db as never, log: noToken });
    expect(output(noToken.warn)).not.toContain("setup-token");
  });

  it("falls back to the existing-admin check when another process created it first", async () => {
    const other = await admin("admin", GENERATED.SUBBOOST_ADMIN_PASSWORD);
    const { db, tx } = makeDb({ createdByOtherProcess: other });
    const log = makeLog();
    await expect(bootstrapLocalAdmin({ env: GENERATED, db: db as never, log })).resolves.toEqual({
      status: "exists",
      username: "admin",
      matches: true,
    });
    expect(tx.localAdmin.create).not.toHaveBeenCalled();
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
    mocks.prisma.localAdmin.findFirst.mockRejectedValueOnce(new Error("db down"));
    const log = makeLog();
    await expect(runAdminBootstrap(log)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith("[subboost] 管理员账号检查失败：", expect.any(Error));
    vi.unstubAllEnvs();
  });
});
