import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z.object({
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  databaseUrl: z.string().min(1),
  // "*" = allow all origins; otherwise a single URL or comma-separated list.
  frontendUrl: z.string().min(1),
  userJwtSecret: z.string().min(32),
  adminJwtSecret: z.string().min(32),
  userJwtExpiresIn: z.string().default("7d"),
  adminJwtExpiresIn: z.string().default("8h"),
  encryptionKey: z.string().length(64),
  walletApiBaseUrl: z.string().url(),
  walletApiToken: z.string().min(1),
  walletCallbackUrl: z.string().url(),
  melipayamakUsername: z.string().default(""),
  melipayamakPassword: z.string().default(""),
  melipayamakFromNumber: z.string().default(""),
});

export const config = configSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  userJwtSecret: process.env.USER_JWT_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET,
  userJwtExpiresIn: process.env.USER_JWT_EXPIRES_IN,
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN,
  encryptionKey: process.env.ENCRYPTION_KEY,
  walletApiBaseUrl: process.env.WALLET_API_BASE_URL,
  walletApiToken: process.env.WALLET_API_TOKEN,
  walletCallbackUrl: process.env.WALLET_CALLBACK_URL,
  melipayamakUsername: process.env.MELIPAYAMAK_USERNAME,
  melipayamakPassword: process.env.MELIPAYAMAK_PASSWORD,
  melipayamakFromNumber: process.env.MELIPAYAMAK_FROM_NUMBER,
});
