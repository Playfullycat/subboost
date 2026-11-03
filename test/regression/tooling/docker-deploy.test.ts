import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const initScript = path.join(root, "local/docker/init-secrets.sh");
const entrypoint = path.join(root, "local/docker/entrypoint.sh");
const SECRET_NAMES = ["CRON_SECRET", "ENCRYPTION_KEY", "JWT_SECRET", "LOCAL_SETUP_TOKEN", "POSTGRES_PASSWORD"];

const tempDirs: string[] = [];

function makeSecretsDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "subboost-secrets-"));
  tempDirs.push(dir);
  return dir;
}

function cleanEnv(extra: Record<string, string>) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", LC_ALL: "C" };
  if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT;
  return { ...env, ...extra };
}

function runInit(dir: string, extra: Record<string, string> = {}) {
  const result = spawnSync("sh", [initScript], {
    encoding: "utf8",
    timeout: 30_000,
    env: cleanEnv({ SUBBOOST_SECRETS_DIR: dir, ...extra }),
  });
  expect(result.status, result.stderr).toBe(0);
  return result;
}

function runEntrypoint(dir: string, extra: Record<string, string> = {}) {
  const result = spawnSync(
    "sh",
    [entrypoint, process.execPath, "-e", "process.stdout.write('\\nENV=' + JSON.stringify(process.env))"],
    { encoding: "utf8", timeout: 30_000, env: cleanEnv({ SUBBOOST_SECRETS_DIR: dir, ...extra }) },
  );
  expect(result.status, result.stderr).toBe(0);
  const marker = result.stdout.lastIndexOf("\nENV=");
  return {
    log: result.stdout.slice(0, marker),
    env: JSON.parse(result.stdout.slice(marker + "\nENV=".length)) as Record<string, string | undefined>,
  };
}

const readSecret = (dir: string, name: string) => readFileSync(path.join(dir, name), "utf8");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    for (const name of readdirSync(dir)) chmodSync(path.join(dir, name), 0o600);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("docker init-secrets.sh", () => {
  it("generates every secret once and keeps it on later runs", () => {
    const dir = makeSecretsDir();
    runInit(dir);
    expect(readdirSync(dir).sort()).toEqual(SECRET_NAMES);
    expect(readSecret(dir, "POSTGRES_PASSWORD")).toMatch(/^[0-9a-f]{36}$/);
    for (const name of ["CRON_SECRET", "ENCRYPTION_KEY", "JWT_SECRET", "LOCAL_SETUP_TOKEN"]) {
      expect(readSecret(dir, name)).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(readSecret(dir, "JWT_SECRET")).not.toBe(readSecret(dir, "ENCRYPTION_KEY"));

    const before = Object.fromEntries(SECRET_NAMES.map((name) => [name, readSecret(dir, name)]));
    const second = runInit(dir, { ENCRYPTION_KEY: "should-not-replace-existing" });
    expect(second.stdout).not.toContain("generated");
    expect(Object.fromEntries(SECRET_NAMES.map((name) => [name, readSecret(dir, name)]))).toEqual(before);
  });

  it("seeds missing secrets from existing environment values", () => {
    const dir = makeSecretsDir();
    const result = runInit(dir, { POSTGRES_PASSWORD: "legacy-db-password", ENCRYPTION_KEY: "legacy-key" });
    expect(readSecret(dir, "POSTGRES_PASSWORD")).toBe("legacy-db-password");
    expect(readSecret(dir, "ENCRYPTION_KEY")).toBe("legacy-key");
    expect(result.stdout).toContain("ENCRYPTION_KEY: environment");
    expect(result.stdout).toContain("JWT_SECRET: generated");
  });
});

describe("docker entrypoint.sh", () => {
  it("exports secrets, builds an encoded DATABASE_URL and prints the setup link", () => {
    const dir = makeSecretsDir();
    runInit(dir, { POSTGRES_PASSWORD: "p@ss/w:rd" });
    const { env, log } = runEntrypoint(dir, { APP_URL: "https://sub.example.com/" });

    expect(env.ENCRYPTION_KEY).toBe(readSecret(dir, "ENCRYPTION_KEY"));
    expect(env.JWT_SECRET).toBe(readSecret(dir, "JWT_SECRET"));
    expect(env.CRON_SECRET).toBe(readSecret(dir, "CRON_SECRET"));
    expect(env.DATABASE_URL).toBe("postgresql://subboost:p%40ss%2Fw%3Ard@db:5432/subboost?schema=public");
    expect(env.POSTGRES_PASSWORD).toBeUndefined();
    expect(log).toContain(`https://sub.example.com/login#setup-token=${readSecret(dir, "LOCAL_SETUP_TOKEN")}`);
  });

  it("prefers explicit environment values and stays quiet for the cron role", () => {
    const dir = makeSecretsDir();
    runInit(dir);
    const { env, log } = runEntrypoint(dir, {
      SUBBOOST_ROLE: "cron",
      ENCRYPTION_KEY: "explicit-key",
      DATABASE_URL: "postgresql://u:p@elsewhere:5432/x",
    });
    expect(env.ENCRYPTION_KEY).toBe("explicit-key");
    expect(env.DATABASE_URL).toBe("postgresql://u:p@elsewhere:5432/x");
    expect(log).not.toContain("setup-token");
  });
});

type ComposeService = {
  image?: string;
  environment?: Record<string, string>;
  depends_on?: Record<string, { condition: string }>;
  volumes?: unknown[];
};

describe("docker-compose.yml", () => {
  const source = readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  const compose = yaml.load(source) as { services: Record<string, ComposeService>; volumes: Record<string, unknown> };

  it("needs no user-provided secrets", () => {
    expect(source).not.toMatch(/:\?/);
    expect(Object.keys(compose.services).sort()).toEqual(["app", "cron", "db", "init"]);
    expect(Object.keys(compose.volumes).sort()).toEqual(["subboost-db", "subboost-secrets"]);
  });

  it("starts services only after the secrets exist", () => {
    const { app, cron, db } = compose.services;
    expect(db.environment?.POSTGRES_PASSWORD_FILE).toBe("/run/subboost/secrets/POSTGRES_PASSWORD");
    expect(db.environment).not.toHaveProperty("POSTGRES_PASSWORD");
    expect(db.depends_on?.init.condition).toBe("service_completed_successfully");
    expect(app.depends_on?.init.condition).toBe("service_completed_successfully");
    expect(app.depends_on?.db.condition).toBe("service_healthy");
    expect(cron.depends_on?.app.condition).toBe("service_healthy");
  });

  it("keeps the image line the release workflow rewrites", () => {
    expect(source).toMatch(/^x-subboost-image: &subboost-image \$\{SUBBOOST_IMAGE:-ghcr\.io\/[^/]+\/subboost:latest\}$/m);
    const workflow = readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain('sed "s#^x-subboost-image:.*#');
    expect(workflow).toContain("dist/release-assets/docker-compose.yml");
  });

  it("ships the docker helper scripts in the image", () => {
    const dockerfile = readFileSync(path.join(root, "local/Dockerfile"), "utf8");
    expect(dockerfile).toContain("COPY --chown=node:node --chmod=0755 local/docker local/docker");
    expect(dockerfile).toContain('ENTRYPOINT ["/app/local/docker/entrypoint.sh"]');
    expect(dockerfile).toContain("ENV HOSTNAME=0.0.0.0");
  });
});
