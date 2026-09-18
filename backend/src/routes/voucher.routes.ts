import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import {
  getVoucherPlatform,
  createVoucherPurchase,
  payVoucherPurchase,
  listUserVoucherPurchases,
} from "../controllers/voucher.controller.js";

const router = Router();

router.get("/platforms/:slug", authenticateUser, getVoucherPlatform);
router.get("/purchases", authenticateUser, listUserVoucherPurchases);
router.post("/purchases", authenticateUser, createVoucherPurchase);
router.post("/purchases/:id/pay", authenticateUser, payVoucherPurchase);

export default router;
