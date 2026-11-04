import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalRateLimitsForTests,
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
  resetLocalRateLimit,
} from "./rate-limit";

describe("local rate limits", () => {
  beforeEach(() => clearLocalRateLimitsForTests());

  it("blocks requests above a fixed-window limit and resets after expiry", () => {
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 1_000 }).allowed).toBe(true);
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 2_000 }).allowed).toBe(true);
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 3_000 })).toEqual({
      allowed: false,
      retryAfterSeconds: 8,
    });
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 11_000 }).allowed).toBe(true);
  });

  it("hashes sensitive keys and supports clearing successful identity buckets", () => {
    const key = hashLocalRateLimitKey("secret-token");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("secret-token");
    consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 1_000 });
    expect(consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 2_000 }).allowed).toBe(false);
    resetLocalRateLimit("token", key);
    expect(consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 2_000 }).allowed).toBe(true);
  });

  it("returns a structured 429 response with Retry-After", async () => {
    const response = localRateLimitResponse("slow down", 7);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    await expect(response.json()).resolves.toEqual({ error: "slow down", code: "RATE_LIMITED" });
  });

  it("uses only runtime or explicitly trusted proxy client addresses", () => {
    const direct = new Request("https://local.test");
    expect(getTrustedClientRateLimitKey(direct)).toBeNull();

    const runtime = Object.assign(new Request("https://local.test"), { ip: "203.0.113.10" });
    expect(getTrustedClientRateLimitKey(runtime)).toBe(hashLocalRateLimitKey("203.0.113.10"));

    process.env.TRUST_PROXY_HEADERS = "true";
    // The proxy appends the real connecting address last; earlier entries come from the client.
    const proxied = new Request("https://local.test", { headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.1" } });
    expect(getTrustedClientRateLimitKey(proxied)).toBe(hashLocalRateLimitKey("10.0.0.1"));
    delete process.env.TRUST_PROXY_HEADERS;
  });

  it("ignores client-supplied CF-Connecting-IP unless Cloudflare mode is enabled", () => {
    const headers = { "cf-connecting-ip": "203.0.113.66", "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1, 198.51.100.7" };

    process.env.TRUST_PROXY_HEADERS = "true";
    expect(getTrustedClientRateLimitKey(new Request("https://local.test", { headers }))).toBe(hashLocalRateLimitKey("198.51.100.7"));

    process.env.TRUST_PROXY_HEADERS = " Cloudflare ";
    expect(getTrustedClientRateLimitKey(new Request("https://local.test", { headers }))).toBe(hashLocalRateLimitKey("203.0.113.66"));
    const withoutCf = new Request("https://local.test", { headers: { "x-real-ip": "198.51.100.7" } });
    expect(getTrustedClientRateLimitKey(withoutCf)).toBe(hashLocalRateLimitKey("198.51.100.7"));

    process.env.TRUST_PROXY_HEADERS = "yes";
    expect(getTrustedClientRateLimitKey(new Request("https://local.test", { headers }))).toBeNull();
    delete process.env.TRUST_PROXY_HEADERS;
  });

  it("caps in-memory buckets at 10,000 by evicting the earliest expiry", () => {
    for (let index = 0; index < 10_000; index += 1) {
      consumeLocalRateLimit("bounded", String(index), { limit: 1, windowMs: 60_000, now: 1_000 });
    }
    consumeLocalRateLimit("bounded", "overflow", { limit: 1, windowMs: 60_000, now: 1_000 });

    expect(consumeLocalRateLimit("bounded", "0", { limit: 1, windowMs: 60_000, now: 1_001 }).allowed).toBe(true);
    expect(consumeLocalRateLimit("bounded", "9999", { limit: 1, windowMs: 60_000, now: 1_001 }).allowed).toBe(false);
  });
});
