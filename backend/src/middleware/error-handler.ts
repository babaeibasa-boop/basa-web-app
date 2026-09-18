import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendError } from "../lib/response.js";

function httpStatus(err: Error) {
  const status = (err as Error & { status?: unknown; statusCode?: unknown }).status
    ?? (err as Error & { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  if (err instanceof ZodError) {
    const message = err.errors.map((issue) => issue.message).join("، ") || "داده ارسالی نامعتبر است";
    sendError(res, message, 400);
    return;
  }

  const status = httpStatus(err);
  if (status === 413) {
    sendError(res, "حجم داده ارسالی بیش از حد مجاز است", 413);
    return;
  }
  if (err instanceof SyntaxError && status === 400) {
    sendError(res, "داده ارسالی نامعتبر است", 400);
    return;
  }

  logger.error({ err }, "Unhandled error");
  sendError(res, "خطای داخلی سرور", 500);
}
