import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./lib/config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { sendError, sendSuccess } from "./lib/response.js";
import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import reftekRoutes from "./routes/reftek.routes.js";
import voucherRoutes from "./routes/voucher.routes.js";
import creditRoutes from "./routes/credit.routes.js";
import walletTopRoutes from "./routes/wallet/top/wallet-top.routes.js";

export function createApp() {
  const app = express();

  // The platform proxy terminates TLS. Without this, req.ip is the proxy for every
  // visitor and the auth rate limits share a single bucket.
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const allowAllOrigins = config.frontendUrl.trim() === "*";
  const allowedOrigins = allowAllOrigins
    ? []
    : config.frontendUrl
        .split(",")
        .map((url) => url.trim().replace(/\/$/, ""))
        .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (allowAllOrigins) {
          callback(null, true);
          return;
        }
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/$/, "");
        if (allowedOrigins.includes(normalized)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    sendSuccess(res, { status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/reftek", reftekRoutes);
  app.use("/api/vouchers", voucherRoutes);
  app.use("/api/credits", creditRoutes);
  app.use("/wallet/top", walletTopRoutes);

  app.use((_req, res) => {
    sendError(res, "مسیر یافت نشد", 404);
  });

  app.use(errorHandler);

  return app;
}
