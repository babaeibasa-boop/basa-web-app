/** Stable key for one splash wallet-login attempt (ut + optional scope). */
export function buildWalletLoginAttemptKey(
  ut: string,
  platformSlug?: string,
  walletScope?: string,
): string {
  return `${ut}\0${platformSlug ?? ""}\0${walletScope ?? ""}`;
}

/**
 * Returns true only for the first call with a given attempt key.
 * Used by SplashPage so React effect re-runs do not re-hit /auth/wallet.
 */
export function shouldStartWalletLogin(
  previousAttempt: string | null,
  nextAttempt: string,
): boolean {
  return previousAttempt !== nextAttempt;
}
