import { Router } from "express";
import { walletAuth, getProfile } from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.post("/wallet", walletAuth);
router.get("/profile", authenticateUser, getProfile);

export default router;
