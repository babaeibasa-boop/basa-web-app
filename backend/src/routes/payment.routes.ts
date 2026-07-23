import { Router } from "express";
import { payInvoice, verifyPaymentCallback } from "../controllers/payment.controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.post("/invoices/:id/pay", authenticateUser, payInvoice);
router.post("/verify", authenticateUser, verifyPaymentCallback);

export default router;
