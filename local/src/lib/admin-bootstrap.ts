import bcrypt from "bcryptjs";
import { getLocalAdminSetupCredentialError } from "./admin-credentials";
import { prisma } from "./prisma";

/** 与 /api/setup/admin 相同的 advisory lock，避免并发启动时重复创建管理员。 */
const ADMIN_SETUP_LOCK_ID = 1_397_704_283;
const DEFAULT_ADMIN_USERNAME = "admin";
const PASSWORD_SECRET_PATH = "/run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD";

export type AdminBootstrapResult =
  | { status: "skipped"; reason: "not-configured" | "admin-exists" }
  | { status: "invalid"; error: string }
  | { status: "created"; username: string };

type Logger = Pick<Console, "log" | "warn" | "error">;

type BootstrapPrisma = {
  localAdmin: { count: () => Promise<number> };
  $transaction: <T>(callback: (tx: BootstrapTransaction) => Promise<T>) => Promise<T>;
};

type BootstrapTransaction = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  localAdmin: {
    count: () => Promise<number>;
    create: (args: { data: { username: string; passwordHash: string } }) => Promise<unknown>;
  };
};

function setupLink(env: Record<string, string | undefined>): string | null {
  const token = env.LOCAL_SETUP_TOKEN?.trim();
  if (!token) return null;
  const appUrl = (env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${appUrl}/login#setup-token=${token}`;
}

function printCredentials(log: Logger, username: string, password: string) {
  log.log(
    [
      "[subboost] ================================================",
      "[subboost] 已自动创建管理员 / Admin account created",
      `[subboost]   用户名 Username: ${username}`,
      `[subboost]   密码   Password: ${password}`,
      "[subboost] 请登录后在「账户设置 → 修改密码」中修改密码。",
      `[subboost] 忘记初始密码：docker compose exec app cat ${PASSWORD_SECRET_PATH}`,
      "[subboost] ================================================",
    ].join("\n")
  );
}

/**
 * 首次启动时自动创建管理员：用户名取 SUBBOOST_ADMIN_USERNAME（默认 admin），
 * 密码取 SUBBOOST_ADMIN_PASSWORD（docker-compose 中填写，或由 init 容器自动生成）。
 * 已有管理员时不做任何修改；未配置密码时（例如本地开发）保持原有的初始化链接流程。
 */
export async function bootstrapLocalAdmin(
  options: { env?: Record<string, string | undefined>; db?: BootstrapPrisma; log?: Logger } = {}
): Promise<AdminBootstrapResult> {
  const env = options.env ?? process.env;
  const db = options.db ?? (prisma as unknown as BootstrapPrisma);
  const log = options.log ?? console;

  const password = env.SUBBOOST_ADMIN_PASSWORD?.trim() ?? "";
  if (!password) return { status: "skipped", reason: "not-configured" };
  if ((await db.localAdmin.count()) > 0) return { status: "skipped", reason: "admin-exists" };

  const username = env.SUBBOOST_ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const error = getLocalAdminSetupCredentialError({ username, password, passwordConfirm: password });
  if (error) {
    const link = setupLink(env);
    log.warn(
      `[subboost] SUBBOOST_ADMIN_USERNAME / SUBBOOST_ADMIN_PASSWORD 无效（${error}），未自动创建管理员。` +
        (link ? `请修改 docker-compose 后重启，或打开初始化链接创建：${link}` : "请修改 docker-compose 后重启。")
    );
    return { status: "invalid", error };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADMIN_SETUP_LOCK_ID}) IS NULL AS "locked"`;
    if (await tx.localAdmin.count()) return false;
    await tx.localAdmin.create({ data: { username, passwordHash } });
    return true;
  });
  if (!created) return { status: "skipped", reason: "admin-exists" };

  if (env.SUBBOOST_ADMIN_PASSWORD_SOURCE === "generated") {
    printCredentials(log, username, password);
  } else {
    log.log(`[subboost] 已使用 docker-compose 中设置的账号密码创建管理员：${username}`);
  }
  return { status: "created", username };
}

/** 启动钩子入口：失败只记录日志，不阻止服务启动（仍可通过初始化链接创建管理员）。 */
export async function runAdminBootstrap(log: Logger = console): Promise<void> {
  try {
    await bootstrapLocalAdmin({ log });
  } catch (error) {
    log.error("[subboost] 自动创建管理员失败：", error);
  }
}
