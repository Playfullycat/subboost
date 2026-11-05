// 容器内执行 `prisma migrate deploy` 使用的配置。
// 镜像只包含 Next.js standalone 运行时，Prisma 命令行单独安装在 /opt/prisma，
// 因此这个配置放在那里，从那里解析 prisma/config，数据库地址由 entrypoint.sh 提供。
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "/app/local/prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
