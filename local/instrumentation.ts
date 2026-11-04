/**
 * Next.js 服务端启动钩子：首次启动时自动创建管理员（见 src/lib/admin-bootstrap.ts）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runAdminBootstrap } = await import("./src/lib/admin-bootstrap");
  await runAdminBootstrap();
}
