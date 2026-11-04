#!/bin/sh
# Generates the deployment secrets once into the shared secrets volume.
# Runs as root in the one-shot `init` Compose service; later runs keep existing files.
# A non-empty environment value (e.g. from a pre-existing .env) seeds the file instead
# of a random value, so older installations keep their database password and keys.
set -eu

SECRETS_DIR="${SUBBOOST_SECRETS_DIR:-/run/subboost/secrets}"
# node:alpine runs the app as uid/gid 1000; postgres:alpine runs as uid/gid 70.
APP_UID="${SUBBOOST_APP_UID:-1000}"
APP_GID="${SUBBOOST_APP_GID:-1000}"
DB_GID="${SUBBOOST_DB_GID:-70}"

random_hex() {
  head -c "$1" /dev/urandom | od -An -v -tx1 | tr -d ' \n'
}

is_root() {
  [ "$(id -u)" = "0" ]
}

ensure_secret() {
  name="$1"
  bytes="$2"
  owner="$3"
  mode="$4"
  file="$SECRETS_DIR/$name"

  if [ ! -s "$file" ]; then
    eval "value=\${$name:-}"
    if [ -n "$value" ]; then
      source_label="environment"
    else
      value="$(random_hex "$bytes")"
      source_label="generated"
    fi
    tmp="$file.tmp.$$"
    (umask 077 && printf '%s' "$value" > "$tmp")
    mv "$tmp" "$file"
    echo "[subboost-init] $name: $source_label"
  fi

  if is_root; then chown "$owner" "$file"; fi
  chmod "$mode" "$file"
}

mkdir -p "$SECRETS_DIR"
chmod 0755 "$SECRETS_DIR"

# The database password is read by both postgres (group) and the app (owner).
ensure_secret POSTGRES_PASSWORD 18 "$APP_UID:$DB_GID" 0440
ensure_secret ENCRYPTION_KEY 32 "$APP_UID:$APP_GID" 0400
ensure_secret JWT_SECRET 32 "$APP_UID:$APP_GID" 0400
ensure_secret CRON_SECRET 32 "$APP_UID:$APP_GID" 0400
ensure_secret LOCAL_SETUP_TOKEN 32 "$APP_UID:$APP_GID" 0400
# 首次启动自动创建管理员时使用的初始密码；在 docker-compose 中设置 SUBBOOST_ADMIN_PASSWORD 可自定义。
ensure_secret SUBBOOST_ADMIN_PASSWORD 12 "$APP_UID:$APP_GID" 0400

echo "[subboost-init] secrets ready in $SECRETS_DIR"
