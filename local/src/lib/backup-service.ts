import { resolveAppVersionInfo } from "@subboost/server-core/app-version";
import { BACKUP_SCHEMA, type BackupPayload } from "@subboost/server-core/backup/backup-file";
import { decryptJsonObject } from "./crypto";
import { prisma } from "./prisma";
import { prepareSubscriptionRecord, readSubscriptionSecrets } from "./subscription-service";
import { prepareTemplateRecord } from "./template-service";

export type BackupImportMode = "merge" | "replace";

export type BackupImportSummary = {
  mode: BackupImportMode;
  subscriptions: { total: number; created: number; updated: number; deleted: number };
  templates: { total: number; created: number; skipped: number; deleted: number };
  settingsApplied: boolean;
  backup: { exportedAt: string; appVersion: string };
};

export class BackupImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupImportError";
  }
}

const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;

export async function exportBackup(ownerId: string): Promise<BackupPayload> {
  const [admin, subscriptions, templates] = await Promise.all([
    prisma.localAdmin.findUnique({ where: { id: ownerId }, select: { allowUnsafeSubscriptionSources: true } }),
    prisma.subscription.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.localTemplate.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    appVersion: resolveAppVersionInfo({ env: process.env, cwd: process.cwd() }).releaseVersion,
    settings: { allowUnsafeSubscriptionSources: admin?.allowUnsafeSubscriptionSources ?? false },
    subscriptions: subscriptions.map((row) => {
      const secrets = readSubscriptionSecrets(row);
      return {
        name: row.name,
        token: row.token,
        isPrimary: row.isPrimary,
        autoUpdateInterval: row.autoUpdateInterval,
        urls: secrets.urls,
        nodes: secrets.nodes,
        config: secrets.config,
        subscriptionInfo: secrets.subscriptionInfo,
      };
    }),
    templates: templates.map((row) => ({
      name: row.name,
      description: row.description,
      config: decryptJsonObject(row.encryptedConfig),
    })),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 先完整校验并加密备份里的每一条数据；任何一条无效都不会写库。 */
function prepareRecords(payload: BackupPayload) {
  const subscriptions = payload.subscriptions.map((subscription, index) => {
    try {
      return {
        token: subscription.token,
        isPrimary: subscription.isPrimary,
        ...prepareSubscriptionRecord(subscription),
      };
    } catch (error) {
      throw new BackupImportError(`第 ${index + 1} 个订阅「${subscription.name}」无效：${describeError(error)}`);
    }
  });
  const templates = payload.templates.map((template, index) => {
    try {
      return prepareTemplateRecord(template);
    } catch (error) {
      throw new BackupImportError(`第 ${index + 1} 个模板「${template.name}」无效：${describeError(error)}`);
    }
  });
  return { subscriptions, templates };
}

export async function importBackup(
  ownerId: string,
  payload: BackupPayload,
  mode: BackupImportMode,
  options: { dryRun?: boolean } = {}
): Promise<BackupImportSummary> {
  const records = prepareRecords(payload);
  const tokens = records.subscriptions.map((record) => record.token);

  const [existingSubscriptions, existingTemplates] = await Promise.all([
    prisma.subscription.findMany({ where: { token: { in: tokens } }, select: { id: true, token: true, ownerId: true } }),
    prisma.localTemplate.findMany({ where: { ownerId }, select: { name: true } }),
  ]);
  if (existingSubscriptions.some((row) => row.ownerId !== ownerId)) {
    throw new BackupImportError("备份中的订阅 token 已被其他账号占用。");
  }
  const [ownedSubscriptionCount, ownedTemplateCount] =
    mode === "replace"
      ? await Promise.all([
          prisma.subscription.count({ where: { ownerId } }),
          prisma.localTemplate.count({ where: { ownerId } }),
        ])
      : [0, 0];

  const existingTokenSet = new Set(existingSubscriptions.map((row) => row.token));
  const knownTemplateNames = new Set(mode === "replace" ? [] : existingTemplates.map((row) => row.name));
  const templatesToCreate = records.templates.filter((record) => {
    if (knownTemplateNames.has(record.name)) return false;
    knownTemplateNames.add(record.name);
    return true;
  });
  const updatedCount = mode === "replace" ? 0 : records.subscriptions.filter((record) => existingTokenSet.has(record.token)).length;

  const summary: BackupImportSummary = {
    mode,
    subscriptions: {
      total: records.subscriptions.length,
      created: records.subscriptions.length - updatedCount,
      updated: updatedCount,
      deleted: ownedSubscriptionCount,
    },
    templates: {
      total: records.templates.length,
      created: templatesToCreate.length,
      skipped: records.templates.length - templatesToCreate.length,
      deleted: ownedTemplateCount,
    },
    settingsApplied: mode === "replace",
    backup: { exportedAt: payload.exportedAt, appVersion: payload.appVersion },
  };
  if (options.dryRun) return summary;

  await prisma.$transaction(
    async (tx) => {
      if (mode === "replace") {
        await tx.subscription.deleteMany({ where: { ownerId } });
        await tx.localTemplate.deleteMany({ where: { ownerId } });
        await tx.localAdmin.update({
          where: { id: ownerId },
          data: { allowUnsafeSubscriptionSources: payload.settings.allowUnsafeSubscriptionSources },
        });
      }

      for (const record of records.subscriptions) {
        // 导入后清空缓存时间，下次访问订阅时按导入的数据重新生成。
        const data = { ...record, cacheExpiresAt: null };
        if (mode === "merge" && existingTokenSet.has(record.token)) {
          await tx.subscription.update({ where: { token: record.token }, data });
        } else {
          await tx.subscription.create({ data: { ...data, ownerId } });
        }
      }

      if (templatesToCreate.length > 0) {
        await tx.localTemplate.createMany({ data: templatesToCreate.map((record) => ({ ...record, ownerId })) });
      }
    },
    { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: IMPORT_TRANSACTION_TIMEOUT_MS }
  );

  return summary;
}
