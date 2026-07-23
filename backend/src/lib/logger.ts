import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.nodeEnv === "production" ? "info" : "debug",
  transport:
    config.nodeEnv !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export const logAuth = (message: string, meta?: Record<string, unknown>) =>
  logger.info({ category: "auth", ...meta }, message);

export const logPayment = (message: string, meta?: Record<string, unknown>) =>
  logger.info({ category: "payment", ...meta }, message);

export const logRefund = (message: string, meta?: Record<string, unknown>) =>
  logger.info({ category: "refund", ...meta }, message);

export const logStatusChange = (message: string, meta?: Record<string, unknown>) =>
  logger.info({ category: "status_change", ...meta }, message);

export const logWalletError = (message: string, meta?: Record<string, unknown>) =>
  logger.error({ category: "wallet_error", ...meta }, message);

export const logExternalError = (message: string, meta?: Record<string, unknown>) =>
  logger.error({ category: "external_error", ...meta }, message);
