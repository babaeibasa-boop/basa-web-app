import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  walletAuth,
  getProfile,
  getCaptcha,
  otpRequest,
  otpVerify,
} from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

const captchaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تعداد درخواست‌ها بیش از حد مجاز است", data: null },
});

const walletAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تعداد تلاش‌های ورود بیش از حد مجاز است", data: null },
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

router.post("/wallet", walletAuthLimiter, walletAuth);
router.get("/captcha", captchaLimiter, getCaptcha);
router.post("/otp/request", otpRequestLimiter, otpRequest);
router.post("/otp/verify", otpVerifyLimiter, otpVerify);
router.get("/profile", authenticateUser, getProfile);

export default router;
