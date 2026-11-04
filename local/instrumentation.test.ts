import { afterEach, describe, expect, it, vi } from "vitest";

const runAdminBootstrap = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./src/lib/admin-bootstrap", () => ({ runAdminBootstrap }));

import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("instrumentation register", () => {
  it("bootstraps the admin only in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(runAdminBootstrap).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(runAdminBootstrap).toHaveBeenCalledTimes(1);
  });
});
