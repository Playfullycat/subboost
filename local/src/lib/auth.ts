import { prisma } from "./prisma";
import { readSession } from "./session";

export type CurrentAdmin = {
  id: string;
  username: string;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await readSession();
  if (!session) return null;
  const admin = await prisma.localAdmin.findUnique({
    where: { id: session.adminId },
    select: { id: true, username: true, sessionsValidAfter: true },
  });
  if (!admin) return null;
  // 修改密码后，之前签发的会话（包括其他设备）全部失效。
  if (admin.sessionsValidAfter && !(session.issuedAt && session.issuedAt >= admin.sessionsValidAfter)) return null;
  return { id: admin.id, username: admin.username };
}

export async function isSetupRequired(): Promise<boolean> {
  const count = await prisma.localAdmin.count();
  return count === 0;
}
