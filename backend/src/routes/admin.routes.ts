import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  profile,
  dashboard,
  orders,
  orderDetail,
  updateStatus,
  updateAmount,
  users,
  phones,
  addPhone,
  deletePhone,
} from "../controllers/admin.controller.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "تعداد تلاش‌های ورود بیش از حد مجاز است", data: null },
});

router.post("/login", loginLimiter, login);
router.get("/profile", authenticateAdmin, profile);
router.get("/dashboard", authenticateAdmin, dashboard);
router.get("/orders", authenticateAdmin, orders);
router.get("/orders/:id", authenticateAdmin, orderDetail);
router.patch("/orders/:id/status", authenticateAdmin, updateStatus);
router.patch("/orders/:id/amount", authenticateAdmin, updateAmount);
router.get("/users", authenticateAdmin, users);
router.get("/phones", authenticateAdmin, phones);
router.post("/phones", authenticateAdmin, addPhone);
router.delete("/phones/:id", authenticateAdmin, deletePhone);

export default router;
