import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../lib/errors.js";

type RequestSource = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: RequestSource = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join("، ");
      next(new AppError(message, 400));
      return;
    }
    req[source] = result.data;
    next();
  };
}
