import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import {
  walletAuth,
  getProfile,
  getCaptcha,
  otpRequest,
  otpVerify,
} from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.js";
import { createFailedLoginLimiter } from "../middleware/failed-login-limiter.js";

const router = Router();

const walletAuthLimitMessage = {
  success: false,
  message: "تعداد تلاش‌های ورود بیش از حد مجاز است",
  data: null,
};

function walletTokenKey(req: Request): string {
  const ut = typeof req.body?.ut === "string" ? req.body.ut : "";
  return `wallet:${createHash("sha256").update(ut).digest("hex")}`;
}

const captchaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تعداد درخواست‌ها بیش از حد مجاز است", data: null },
});

// Count completed failures only. express-rate-limit skipSuccessfulRequests
// increments before the handler runs, so 100 concurrent valid logins from one
// NAT/proxy IP would false-positive 429 once the in-flight count hit 50.
const walletFailureLimiter = createFailedLoginLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: walletAuthLimitMessage,
});

const walletTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: walletTokenKey,
  message: walletAuthLimitMessage,
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تعداد درخواست کد تایید بیش از حد مجاز است", data: null },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تعداد تلاش‌های ورود بیش از حد مجاز است", data: null },
});

router.post("/wallet", walletFailureLimiter, walletTokenLimiter, walletAuth);
router.get("/captcha", captchaLimiter, getCaptcha);
router.post("/otp/request", otpRequestLimiter, otpRequest);
router.post("/otp/verify", otpVerifyLimiter, otpVerify);
router.get("/profile", authenticateUser, getProfile);

export default router;
