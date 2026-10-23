import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import {
  getBalance,
  getInstallments,
  getMerchants,
  getPlatform,
  getTransactions,
  launch,
  listPlatforms,
  saveNationalCode,
} from "../controllers/credit.controller.js";

const router = Router();

router.post("/national-code", authenticateUser, saveNationalCode);
router.get("/platforms", authenticateUser, listPlatforms);
router.get("/platforms/:slug", authenticateUser, getPlatform);
router.get("/platforms/:slug/balance", authenticateUser, getBalance);
router.get("/platforms/:slug/transactions", authenticateUser, getTransactions);
router.get("/platforms/:slug/installments", authenticateUser, getInstallments);
router.get("/platforms/:slug/merchants", authenticateUser, getMerchants);
router.get("/platforms/:slug/launch", authenticateUser, launch);

export default router;
