import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./lib/config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { sendSuccess } from "./lib/response.js";
import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import reftekRoutes from "./routes/reftek.routes.js";
import walletTopRoutes from "./routes/wallet/top/wallet-top.routes.js";

const app = express();

// Allow cross-origin API calls from the configured frontend(s).
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
      // Non-browser clients (curl, server-to-server) send no Origin.
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
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
app.use("/wallet/top", walletTopRoutes);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(
    allowAllOrigins
      ? "CORS: all origins allowed"
      : `CORS allowed origins: ${allowedOrigins.join(", ")}`,
  );
});

export default app;
