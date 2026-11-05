FROM node:24.22.1-alpine AS deps
WORKDIR /package
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/core packages/core
COPY packages/server-core packages/server-core
COPY packages/ui packages/ui
COPY packages/config packages/config
COPY local/package.json local/package.json

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    set -eu; \
    attempt=1; \
    max_attempts=3; \
    until npm ci; do \
      if [ "$attempt" -ge "$max_attempts" ]; then \
        echo "npm ci failed after ${max_attempts} attempts" >&2; \
        exit 1; \
      fi; \
      delay=$((attempt * 10)); \
      echo "npm ci attempt ${attempt} failed; retrying in ${delay}s" >&2; \
      sleep "$delay"; \
      attempt=$((attempt + 1)); \
    done

FROM node:24.22.1-alpine AS builder
WORKDIR /package
RUN apk add --no-cache openssl

ARG APP_RELEASE_VERSION=
ARG APP_BUILD_SHA=
ARG APP_VERSION=
ARG APP_VERSION_TOKEN=
ENV APP_RELEASE_VERSION=${APP_RELEASE_VERSION}
ENV APP_BUILD_SHA=${APP_BUILD_SHA}
ENV APP_VERSION=${APP_VERSION}
ENV APP_VERSION_TOKEN=${APP_VERSION_TOKEN}

COPY --from=deps /package/node_modules node_modules
COPY packages/core packages/core
COPY packages/server-core packages/server-core
COPY packages/ui packages/ui
COPY packages/config packages/config
COPY local local

WORKDIR /package/local
RUN npm run build

# 运行时只需要 Next.js standalone 输出（已按需裁剪依赖）。启动时执行数据库迁移用的 Prisma 命令行
# 单独安装在 /opt/prisma，版本与 package-lock.json 一致，避免把完整的 node_modules（含构建工具）打进镜像。
FROM node:24.22.1-alpine AS prisma-cli
WORKDIR /opt/prisma
COPY package-lock.json /tmp/package-lock.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    set -eu; \
    version="$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")"; \
    # 与根目录 package.json 一样允许 Prisma 的安装脚本，构建时就下载好迁移引擎，运行时无需联网。
    printf '{"private":true,"allowScripts":{"prisma@%s":true,"@prisma/engines@%s":true}}\n' "$version" "$version" > package.json; \
    npm install --omit=dev --no-audit --no-fund --no-package-lock "prisma@${version}"; \
    test -n "$(find node_modules/@prisma/engines -maxdepth 1 -name 'schema-engine-*' -type f)"; \
    node_modules/.bin/prisma --version; \
    rm /tmp/package-lock.json

FROM node:24.22.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id; listen on all interfaces so the healthcheck can use 127.0.0.1.
ENV HOSTNAME=0.0.0.0
ARG APP_RELEASE_VERSION=
ARG APP_BUILD_SHA=
ARG APP_VERSION=
ARG APP_VERSION_TOKEN=
ENV APP_RELEASE_VERSION=${APP_RELEASE_VERSION}
ENV APP_BUILD_SHA=${APP_BUILD_SHA}
ENV APP_VERSION=${APP_VERSION}
ENV APP_VERSION_TOKEN=${APP_VERSION_TOKEN}
RUN apk add --no-cache openssl

COPY --chown=node:node --from=builder /package/local/.next/standalone ./
COPY --from=prisma-cli /opt/prisma /opt/prisma
COPY local/docker/prisma-cli.config.mjs /opt/prisma/prisma.config.mjs
COPY --chown=node:node --from=builder /package/local/.next/static local/.next/static
COPY --chown=node:node --from=builder /package/local/public local/public
COPY --chown=node:node --from=builder /package/local/prisma local/prisma
COPY --chown=node:node --chmod=0755 local/docker local/docker

WORKDIR /app/local
USER node
EXPOSE 3000
ENTRYPOINT ["/app/local/docker/entrypoint.sh"]
CMD ["sh", "-c", "/opt/prisma/node_modules/.bin/prisma migrate deploy --config /opt/prisma/prisma.config.mjs && node server.js"]
