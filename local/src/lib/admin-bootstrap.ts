import bcrypt from "bcryptjs";
import { getLocalAdminSetupCredentialError } from "./admin-credentials";
import { prisma } from "./prisma";

/** 与 /api/setup/admin 相同的 advisory lock，避免并发启动时重复创建管理员。 */
const ADMIN_SETUP_LOCK_ID = 1_397_704_283;
const DEFAULT_ADMIN_USERNAME = "admin";
const PASSWORD_SECRET_PATH = "/run/subboost/secrets/SUBBOOST_ADMIN_PASSWORD";
const LINE = "[subboost] ================================================";

export type AdminBootstrapResult =
  | { status: "skipped"; reason: "not-configured" }
  | { status: "invalid"; error: string }
  | { status: "created"; username: string }
  | { status: "reset"; username: string }
  | { status: "exists"; username: string; matches: boolean };

type Logger = Pick<Console, "log" | "warn" | "error">;

type ExistingAdmin = { id: string; username: string; passwordHash: string };

type BootstrapPrisma = {
  localAdmin: {
    findFirst: (args: { select: { id: true; username: true; passwordHash: true } }) => Promise<ExistingAdmin | null>;
    update: (args: {
      where: { id: string };
      data: { username: string; passwordHash: string; sessionsValidAfter: Date };
    }) => Promise<unknown>;
  };
  $transaction: <T>(callback: (tx: BootstrapTransaction) => Promise<T>) => Promise<T>;
};

type BootstrapTransaction = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  localAdmin: {
    count: () => Promise<number>;
    create: (args: { data: { username: string; passwordHash: string } }) => Promise<unknown>;
  };
};

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function setupLink(env: Record<string, string | undefined>): string | null {
  const token = env.LOCAL_SETUP_TOKEN?.trim();
  if (!token) return null;
  const appUrl = (env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${appUrl}/login#setup-token=${token}`;
}

function passwordSourceLabel(env: Record<string, string | undefined>): string {
  return env.SUBBOOST_ADMIN_PASSWORD_SOURCE === "generated"
    ? "自动生成 / generated"
    : "docker-compose 设置 / from docker-compose";
}

function printCredentials(log: Logger, title: string, username: string, password: string, env: Record<string, string | undefined>) {
  log.log(
    [
      LINE,
      `[subboost] ${title}`,
      `[subboost]   用户名 Username: ${username}`,
      `[subboost]   密码   Password: ${password}`,
      `[subboost]   密码来源 Source: ${passwordSourceLabel(env)}`,
      "[subboost] 登录后可在「账户设置 → 修改密码」中修改密码。",
      env.SUBBOOST_ADMIN_PASSWORD_SOURCE === "generated"
        ? `[subboost] 忘记初始密码：docker compose exec app cat ${PASSWORD_SECRET_PATH}`
        : "[subboost] 密码中的 $ 需写成 $$（或在 .env 中用单引号包住整个值），否则会被 docker compose 当成变量替换。",
      LINE,
    ].join("\n")
  );
}

function printMismatch(log: Logger, existing: string, username: string, env: Record<string, string | undefined>) {
  log.warn(
    [
      LINE,
      `[subboost] 管理员账号已存在：${existing}`,
      `[subboost] docker-compose 中的账号密码（${username} / ${passwordSourceLabel(env)}）与已有账号不一致，未做任何修改。`,
      "[subboost] SUBBOOST_ADMIN_USERNAME / SUBBOOST_ADMIN_PASSWORD 只在首次创建管理员时生效。常见原因：",
      "[subboost]   - 在后台修改过密码（这种情况请继续使用修改后的密码）；",
      "[subboost]   - 数据卷中保留了之前创建的管理员（例如重新部署但没有删除 subboost-db 数据卷）。",
      "[subboost] 要改成 docker-compose 中的账号密码：设置 SUBBOOST_ADMIN_RESET=true 后执行 docker compose up -d，",
      "[subboost] 登录成功后再删除 SUBBOOST_ADMIN_RESET。",
      LINE,
    ].join("\n")
  );
}

/**
 * 管理员账号引导：
 * - 还没有管理员时，用 SUBBOOST_ADMIN_USERNAME（默认 admin）和 SUBBOOST_ADMIN_PASSWORD 创建，并打印账号密码；
 * - 已有管理员时不修改，但会检查 docker-compose 中的账号密码是否与之一致并在日志中说明；
 * - SUBBOOST_ADMIN_RESET=true 时，把已有管理员重置为 docker-compose 中的账号密码，并让所有旧登录失效。
 * 未配置密码时（例如本地开发）不做任何事，保持原有的初始化链接流程。
 */
export async function bootstrapLocalAdmin(
  options: { env?: Record<string, string | undefined>; db?: BootstrapPrisma; log?: Logger } = {}
): Promise<AdminBootstrapResult> {
  const env = options.env ?? process.env;
  const db = options.db ?? (prisma as unknown as BootstrapPrisma);
  const log = options.log ?? console;

  const password = env.SUBBOOST_ADMIN_PASSWORD?.trim() ?? "";
  if (!password) return { status: "skipped", reason: "not-configured" };
  const username = env.SUBBOOST_ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const reset = isEnabled(env.SUBBOOST_ADMIN_RESET);

  const existing = await db.localAdmin.findFirst({ select: { id: true, username: true, passwordHash: true } });
  const error = getLocalAdminSetupCredentialError({ username, password, passwordConfirm: password });
  if (error) {
    const link = existing ? null : setupLink(env);
    log.warn(
      `[subboost] SUBBOOST_ADMIN_USERNAME / SUBBOOST_ADMIN_PASSWORD 无效（${error}），` +
        (existing ? `未修改已有管理员 ${existing.username}。` : "未自动创建管理员。") +
        "请修改 docker-compose 后执行 docker compose up -d" +
        (link ? `，或打开初始化链接创建：${link}` : "。") +
        "（密码中的 $ 需写成 $$，否则会被 docker compose 当成变量替换。）"
    );
    return { status: "invalid", error };
  }

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADMIN_SETUP_LOCK_ID}) IS NULL AS "locked"`;
      if (await tx.localAdmin.count()) return false;
      await tx.localAdmin.create({ data: { username, passwordHash } });
      return true;
    });
    if (!created) return bootstrapLocalAdmin(options);
    printCredentials(log, "已自动创建管理员 / Admin account created", username, password, env);
    return { status: "created", username };
  }

  const matches = existing.username === username && (await bcrypt.compare(password, existing.passwordHash));

  if (reset) {
    if (!matches) {
      await db.localAdmin.update({
        where: { id: existing.id },
        data: { username, passwordHash: await bcrypt.hash(password, 12), sessionsValidAfter: new Date() },
      });
      printCredentials(log, "已重置管理员账号密码，所有设备需重新登录 / Admin account reset", username, password, env);
    } else {
      printCredentials(log, "管理员账号密码已与 docker-compose 一致，无需重置 / Admin already matches", username, password, env);
    }
    log.warn("[subboost] SUBBOOST_ADMIN_RESET 仍处于开启状态：登录成功后请删除它，否则之后在后台修改的密码会在重启时被重置。");
    return { status: "reset", username };
  }

  if (matches) {
    printCredentials(log, "管理员账号 / Admin account", username, password, env);
  } else {
    printMismatch(log, existing.username, username, env);
  }
  return { status: "exists", username: existing.username, matches };
}

/** 启动钩子入口：失败只记录日志，不阻止服务启动（仍可通过初始化链接创建管理员）。 */
export async function runAdminBootstrap(log: Logger = console): Promise<void> {
  try {
    await bootstrapLocalAdmin({ log });
  } catch (error) {
    log.error("[subboost] 管理员账号检查失败：", error);
  }
}
