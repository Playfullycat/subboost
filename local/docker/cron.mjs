// Periodic job runner for the `cron` Compose service.
// Refreshes the rule index every RULE_INDEX_EVERY rounds and subscriptions every round.
// Exits non-zero after a failed round so the container restart policy retries it.

const BASE_URL = (process.env.SUBBOOST_CRON_BASE_URL || "http://app:3000").replace(/\/+$/, "");
const INTERVAL_MS = Number(process.env.SUBBOOST_CRON_INTERVAL_SECONDS || 360) * 1000;
const RULE_INDEX_EVERY = 10;
const FAILURE_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path) {
  console.log(`[local-cron] ${new Date().toISOString()} POST ${path}`);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${(process.env.CRON_SECRET || "").trim()}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (body) console.log(body);
    if (!response.ok) {
      console.error(`[local-cron] ${path} failed with HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[local-cron] ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

for (let round = 0; ; round += 1) {
  let ok = true;
  if (round % RULE_INDEX_EVERY === 0) ok = (await post("/api/cron/update-rule-index")) && ok;
  ok = (await post("/api/cron/update-subscriptions")) && ok;
  if (!ok) {
    console.error("[local-cron] one or more endpoints failed; restarting after delay");
    await sleep(FAILURE_DELAY_MS);
    process.exit(1);
  }
  await sleep(INTERVAL_MS);
}
