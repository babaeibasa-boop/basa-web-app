import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://user:password@localhost:5432/test",
      FRONTEND_URL: "http://localhost:5173",
      USER_JWT_SECRET: "test-user-jwt-secret-min-32-chars!",
      ADMIN_JWT_SECRET: "test-admin-jwt-secret-min-32-chars",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      WALLET_API_BASE_URL: "https://wallet.example.com/api",
      WALLET_API_TOKEN: "wallet-token",
      WALLET_CALLBACK_URL: "http://localhost:5173/payment/result",
      TOP_API_TOKEN: "top-token",
    },
  },
});
