import type { NextFunction, Request, Response } from "express";

export interface FailedLoginLimiterOptions {
  windowMs: number;
  max: number;
  message: unknown;
  /** Override for tests; defaults to req.ip. */
  keyGenerator?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limits by counting completed 400/401 responses only.
 *
 * Unlike express-rate-limit's skipSuccessfulRequests, this does not increment
 * at request start — so concurrent successful logins from one NAT/proxy IP
 * cannot exhaust the bucket before responses finish.
 */
export function createFailedLoginLimiter(options: FailedLoginLimiterOptions) {
  const buckets = new Map<string, Bucket>();
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip || "unknown");

  // Buckets exist only for IPs that failed; sweep expired ones so memory stays bounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs);
  sweep.unref();

  function activeBucket(key: string, now: number): Bucket | undefined {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyGenerator(req);
    const bucket = activeBucket(key, Date.now());

    if (bucket && bucket.count >= options.max) {
      res.status(429).json(options.message);
      return;
    }

    res.on("finish", () => {
      // Count auth/validation failures only — not 429 from another limiter or 5xx.
      if (res.statusCode !== 400 && res.statusCode !== 401) return;
      const now = Date.now();
      const current = activeBucket(key, now);
      if (current) {
        current.count += 1;
      } else {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      }
    });

    next();
  }

  middleware.resetKey = (key: string) => {
    buckets.delete(key);
  };

  middleware.resetAll = () => {
    buckets.clear();
  };

  return middleware;
}
