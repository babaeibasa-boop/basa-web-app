import { Router } from "express";
import {
  listPlans,
  listOrders,
  getOrder,
  createNewOrder,
} from "../controllers/order.controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/plans/:model", authenticateUser, listPlans);
router.get("/", authenticateUser, listOrders);
router.get("/:id", authenticateUser, getOrder);
router.post("/", authenticateUser, createNewOrder);

export default router;
