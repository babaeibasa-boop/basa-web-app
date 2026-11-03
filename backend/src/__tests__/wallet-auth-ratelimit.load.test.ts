/**
 * Load / concurrency / security tests for POST /api/auth/wallet rate limits.
 *
 * Uses synthetic tokens and a mocked auth service — never hits the live wallet
 * API or production data. All requests share one client IP via X-Forwarded-For
 * to simulate users behind a reverse proxy or NAT.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHARED_CLIENT_IP = "203.0.113.50";
/** Artificial auth latency so in-flight requests overlap under the failure limiter. */
const AUTH_LATENCY_MS = 75;

type AuthResult = {
  token: string;
  user: {
    id: string;
    name: string;
    family: string;
    phone: string;
    nationalCode: string | null;
    isDeveloper: boolean;
  };
};

const authenticateWithWalletToken = vi.fn();

function successResult(ut: string): AuthResult {
  const id = ut.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "user";
  return {
    token: `jwt-${id}`,
    user: {
      id,
      name: "Test",
      family: "User",
      phone: "989121234567",
      nationalCode: null,
      isDeveloper: false,
    },
  };
}

async function createWalletAuthServer(options?: {
  authLatencyMs?: number;
}): Promise<{ server: Server; baseUrl: string }> {
  vi.resetModules();
  // Import AppError after resetModules so instanceof matches errorHandler's class.
  const { AppError } = await import("../lib/errors.js");
  const latencyMs = options?.authLatencyMs ?? 0;

  authenticateWithWalletToken.mockReset();
  authenticateWithWalletToken.mockImplementation(async (ut: string) => {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    if (typeof ut === "string" && ut.startsWith("valid-")) {
      return successResult(ut);
    }
    throw new AppError("خطا در احراز هویت کیف پول", 401);
  });

  vi.doMock("../services/auth.service.js", () => ({
    authenticateWithWalletToken,
    getUserProfile: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  }));
  vi.doMock("../services/captcha.service.js", () => ({
    createCaptcha: vi.fn(() => ({ captchaId: "c", svg: "<svg/>" })),
  }));

  const express = (await import("express")).default;
  const { config } = await import("../lib/config.js");
  const authRoutes = (await import("../routes/auth.routes.js")).default;
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

type CallResult = {
  status: number;
  body: unknown;
  ut: string;
};

async function postWallet(
  baseUrl: string,
  ut: string,
  options?: { forwardedFor?: string; walletScope?: "credits" },
): Promise<CallResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options?.forwardedFor !== undefined) {
    headers["x-forwarded-for"] = options.forwardedFor;
  }

  const response = await fetch(`${baseUrl}/api/auth/wallet`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ut,
      ...(options?.walletScope ? { walletScope: options.walletScope } : {}),
    }),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body, ut };
}

function summarize(results: CallResult[]) {
  const byStatus = new Map<number, number>();
  for (const result of results) {
    byStatus.set(result.status, (byStatus.get(result.status) ?? 0) + 1);
  }
  return {
    total: results.length,
    ok: results.filter((r) => r.status === 200).length,
    unauthorized: results.filter((r) => r.status === 401).length,
    tooMany: results.filter((r) => r.status === 429).length,
    other: results.filter((r) => ![200, 401, 429].includes(r.status)).length,
    byStatus: Object.fromEntries(byStatus),
  };
}

describe("POST /api/auth/wallet rate limits (load + security)", () => {
  let server: Server | undefined;
  let baseUrl: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  async function start(options?: { authLatencyMs?: number }) {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ server, baseUrl } = await createWalletAuthServer(options));
  }

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
  });

  function proxyWarnings() {
    const lines = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
      .map((args) => args.map(String).join(" "))
      .join("\n");
    return {
      unexpectedXForwardedFor: lines.includes("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR"),
      permissiveTrustProxy: lines.includes("ERR_ERL_PERMISSIVE_TRUST_PROXY"),
      lines,
    };
  }

  it("allows 100 concurrent unique valid tokens from the same public IP without 429", async () => {
    await start({ authLatencyMs: AUTH_LATENCY_MS });
    const tokens = Array.from({ length: 100 }, (_, i) => `valid-user-${i}`);
    const results = await Promise.all(
      tokens.map((ut) =>
        postWallet(baseUrl, ut, {
          forwardedFor: SHARED_CLIENT_IP,
          walletScope: "credits",
        }),
      ),
    );

    const summary = summarize(results);
    const warnings = proxyWarnings();

    expect(summary.ok).toBe(100);
    expect(summary.tooMany).toBe(0);
    expect(authenticateWithWalletToken).toHaveBeenCalledTimes(100);
    expect(warnings.unexpectedXForwardedFor).toBe(false);
    expect(warnings.permissiveTrustProxy).toBe(false);
  }, 60_000);

  it("does not let one token's per-token limit block other users on the same IP", async () => {
    await start();
    const noisy = "valid-noisy-token";
    const blockedSelf: CallResult[] = [];
    for (let i = 0; i < 31; i++) {
      blockedSelf.push(
        await postWallet(baseUrl, noisy, { forwardedFor: SHARED_CLIENT_IP }),
      );
    }

    const other = await postWallet(baseUrl, "valid-other-user", {
      forwardedFor: SHARED_CLIENT_IP,
    });

    expect(blockedSelf.filter((r) => r.status === 200).length).toBe(30);
    expect(blockedSelf.filter((r) => r.status === 429).length).toBe(1);
    expect(other.status).toBe(200);
  }, 60_000);

  it("limits the same token after 30 attempts in the window", async () => {
    await start();
    const ut = "valid-repeat-token";
    const results: CallResult[] = [];
    for (let i = 0; i < 35; i++) {
      results.push(await postWallet(baseUrl, ut, { forwardedFor: SHARED_CLIENT_IP }));
    }

    const summary = summarize(results);
    expect(summary.ok).toBe(30);
    expect(summary.tooMany).toBe(5);
    expect(results.slice(0, 30).every((r) => r.status === 200)).toBe(true);
    expect(results.slice(30).every((r) => r.status === 429)).toBe(true);
  }, 60_000);

  it("enforces per-IP failed-login limit and does not count successful logins toward it", async () => {
    await start();
    const successes = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        postWallet(baseUrl, `valid-success-${i}`, { forwardedFor: SHARED_CLIENT_IP }),
      ),
    );
    expect(summarize(successes).ok).toBe(60);
    expect(summarize(successes).tooMany).toBe(0);

    const failures: CallResult[] = [];
    for (let i = 0; i < 55; i++) {
      failures.push(
        await postWallet(baseUrl, `invalid-guess-${i}`, {
          forwardedFor: SHARED_CLIENT_IP,
        }),
      );
    }

    const failureSummary = summarize(failures);
    expect(failureSummary.unauthorized).toBe(50);
    expect(failureSummary.tooMany).toBe(5);
    expect(failures.slice(0, 50).every((r) => r.status === 401)).toBe(true);
    expect(failures.slice(50).every((r) => r.status === 429)).toBe(true);

    // Document current express-rate-limit behavior: once the failure bucket is
    // exhausted, the middleware blocks the IP for the rest of the window —
    // including valid tokens. Shared NAT / proxy IPs remain a residual risk.
    const lateSuccess = await postWallet(baseUrl, "valid-after-failures", {
      forwardedFor: SHARED_CLIENT_IP,
    });
    expect(lateSuccess.status).toBe(429);
  }, 90_000);

  it("rate-limits random invalid tokens from one IP (security)", async () => {
    await start();
    const results: CallResult[] = [];
    for (let i = 0; i < 55; i++) {
      results.push(
        await postWallet(baseUrl, `rand-${crypto.randomUUID()}`, {
          forwardedFor: SHARED_CLIENT_IP,
        }),
      );
    }

    const summary = summarize(results);
    expect(summary.unauthorized).toBe(50);
    expect(summary.tooMany).toBe(5);
  }, 60_000);
});
