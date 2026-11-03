// Periodic job runner for the `cron` Compose service.
// Refreshes the rule index every RULE_INDEX_EVERY rounds and subscriptions every round.
// Exits non-zero after a failed round so the container restart policy retries it.
import { pathToFileURL } from "node:url";

export const RULE_INDEX_EVERY = 10;
const FAILURE_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function readCronConfig(env) {
  const seconds = Number(env.SUBBOOST_CRON_INTERVAL_SECONDS);
  return {
    baseUrl: (env.SUBBOOST_CRON_BASE_URL || "http://app:3000").replace(/\/+$/, ""),
    secret: (env.CRON_SECRET || "").trim(),
    intervalMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 360) * 1000,
  };
}

export async function post(path, { baseUrl, secret, fetchImpl = fetch, log = console }) {
  log.log(`[local-cron] ${new Date().toISOString()} POST ${path}`);
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (body) log.log(body);
    if (!response.ok) {
      log.error(`[local-cron] ${path} failed with HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    log.error(`[local-cron] ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Runs one round; every endpoint is attempted even when an earlier one fails. */
export async function runRound(round, options) {
  let ok = true;
  if (round % RULE_INDEX_EVERY === 0) ok = (await post("/api/cron/update-rule-index", options)) && ok;
  ok = (await post("/api/cron/update-subscriptions", options)) && ok;
  return ok;
}

/** Loops until a round fails (or maxRounds is reached), then resolves with the exit code. */
export async function runCron(options) {
  const { intervalMs, sleep = defaultSleep, log = console, maxRounds = Infinity } = options;
  for (let round = 0; round < maxRounds; round += 1) {
    if (!(await runRound(round, options))) {
      log.error("[local-cron] one or more endpoints failed; restarting after delay");
      await sleep(FAILURE_DELAY_MS);
      return 1;
    }
    await sleep(intervalMs);
  }
  return 0;
}

/* v8 ignore next 3 -- process entry point, exercised by the container */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runCron(readCronConfig(process.env)));
}
