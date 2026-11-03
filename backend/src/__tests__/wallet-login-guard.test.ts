import { describe, expect, it } from "vitest";
import {
  buildWalletLoginAttemptKey,
  shouldStartWalletLogin,
} from "../../../frontend/src/lib/wallet-login-guard.ts";

describe("wallet login splash guard", () => {
  it("builds a stable attempt key from ut, platform, and scope", () => {
    expect(buildWalletLoginAttemptKey("tok-1", "plat", "credits")).toBe(
      "tok-1\0plat\0credits",
    );
    expect(buildWalletLoginAttemptKey("tok-1")).toBe("tok-1\0\0");
  });

  it("allows only the first call for the same link/attempt", () => {
    const attempt = buildWalletLoginAttemptKey("tok-1", undefined, "credits");
    let previous: string | null = null;

    expect(shouldStartWalletLogin(previous, attempt)).toBe(true);
    previous = attempt;
    expect(shouldStartWalletLogin(previous, attempt)).toBe(false);
    expect(shouldStartWalletLogin(previous, attempt)).toBe(false);
  });

  it("allows a new request when ut or scope changes", () => {
    const first = buildWalletLoginAttemptKey("tok-1", undefined, "credits");
    const second = buildWalletLoginAttemptKey("tok-2", undefined, "credits");
    const third = buildWalletLoginAttemptKey("tok-1", "voucher-a");

    expect(shouldStartWalletLogin(first, second)).toBe(true);
    expect(shouldStartWalletLogin(second, third)).toBe(true);
  });
});
