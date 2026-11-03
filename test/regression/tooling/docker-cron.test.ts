import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- plain ESM script shipped in the Docker image
import { post, readCronConfig, runCron, runRound } from "../../../local/docker/cron.mjs";

type Call = { url: string; init: RequestInit };

function harness(responses: Array<{ status: number; body?: string } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200 };
    if (next instanceof Error) throw next;
    return new Response(next.body ?? "", { status: next.status });
  });
  const log = { log: vi.fn(), error: vi.fn() };
  const sleep = vi.fn(async () => {});
  return { calls, fetchImpl, log, sleep, options: { baseUrl: "http://app:3000", secret: "s3cret", fetchImpl, log, sleep } };
}

describe("docker cron.mjs", () => {
  it("reads config with defaults and trims values", () => {
    expect(readCronConfig({})).toEqual({ baseUrl: "http://app:3000", secret: "", intervalMs: 360_000 });
    expect(
      readCronConfig({
        SUBBOOST_CRON_BASE_URL: "http://example:3000//",
        CRON_SECRET: "  abc \n",
        SUBBOOST_CRON_INTERVAL_SECONDS: "60",
      }),
    ).toEqual({ baseUrl: "http://example:3000", secret: "abc", intervalMs: 60_000 });
    expect(readCronConfig({ SUBBOOST_CRON_INTERVAL_SECONDS: "nope" }).intervalMs).toBe(360_000);
  });

  it("posts with the bearer secret and reports HTTP and network failures", async () => {
    const h = harness([{ status: 200, body: '{"success":true}' }, { status: 503 }, new Error("ECONNREFUSED")]);
    expect(await post("/api/a", h.options)).toBe(true);
    expect(h.calls[0].url).toBe("http://app:3000/api/a");
    expect(h.calls[0].init.method).toBe("POST");
    expect(h.calls[0].init.headers).toEqual({ Authorization: "Bearer s3cret" });
    expect(h.log.log).toHaveBeenCalledWith('{"success":true}');

    expect(await post("/api/b", h.options)).toBe(false);
    expect(h.log.error).toHaveBeenCalledWith("[local-cron] /api/b failed with HTTP 503");

    expect(await post("/api/c", h.options)).toBe(false);
    expect(h.log.error).toHaveBeenCalledWith("[local-cron] /api/c failed: ECONNREFUSED");

    const throwsString = { ...h.options, fetchImpl: async () => Promise.reject("boom") };
    expect(await post("/api/d", throwsString)).toBe(false);
    expect(h.log.error).toHaveBeenCalledWith("[local-cron] /api/d failed: boom");
  });

  it("refreshes the rule index every tenth round and still updates subscriptions after a failure", async () => {
    const first = harness([{ status: 500 }, { status: 200 }]);
    expect(await runRound(0, first.options)).toBe(false);
    expect(first.calls.map((call) => call.url)).toEqual([
      "http://app:3000/api/cron/update-rule-index",
      "http://app:3000/api/cron/update-subscriptions",
    ]);

    const later = harness([]);
    expect(await runRound(3, later.options)).toBe(true);
    expect(later.calls.map((call) => call.url)).toEqual(["http://app:3000/api/cron/update-subscriptions"]);
  });

  it("sleeps between successful rounds and exits 1 after a failed round", async () => {
    const ok = harness([]);
    expect(await runCron({ ...ok.options, intervalMs: 1000, maxRounds: 2 })).toBe(0);
    expect(ok.sleep.mock.calls).toEqual([[1000], [1000]]);

    const failing = harness([{ status: 200 }, { status: 500 }]);
    expect(await runCron({ ...failing.options, intervalMs: 1000 })).toBe(1);
    expect(failing.sleep.mock.calls).toEqual([[30_000]]);
    expect(failing.log.error).toHaveBeenCalledWith("[local-cron] one or more endpoints failed; restarting after delay");
  });
});
