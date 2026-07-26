import { Router } from "express";
import { launchApp, listApps } from "../controllers/reftek.controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/apps", authenticateUser, listApps);
router.get("/apps/:appId/launch", authenticateUser, launchApp);

export default router;
