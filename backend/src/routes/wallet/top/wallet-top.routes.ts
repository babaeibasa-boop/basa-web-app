import { Router } from "express";
import {
  createPurchaseHandler,
  getUserWalletsHandler,
  getWalletHandler,
  inquiryHandler,
  isUserExists,
  reverseTransactionHandler,
  reverseTransactionPartialHandler,
} from "../../../controllers/wallet/top/wallet-top.controller.js";
import { authenticateTopApiPwd } from "../../../middleware/wallet/top/authenticate-pwd.js";

const router = Router();

router.use(authenticateTopApiPwd);

router.get("/isUserExists", isUserExists);
router.get("/getUserWallets", getUserWalletsHandler);
router.get("/getWallet", getWalletHandler);
router.get("/inquiry", inquiryHandler);
router.post("/createPurchase", createPurchaseHandler);
router.post("/reverseTransaction", reverseTransactionHandler);
router.post("/reverseTransactionPartial", reverseTransactionPartialHandler);

router.use((_req, res) => {
  res.status(422).json({ error_status: "INVALID_METHOD" });
});

export default router;
