import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../lib/config.js";
import { AppError } from "../lib/errors.js";

export interface UserJwtPayload {
  userId: string;
  walletId: string;
}

export interface AdminJwtPayload {
  adminId: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserJwtPayload;
      admin?: AdminJwtPayload;
    }
  }
}

export function authenticateUser(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next(new AppError("احراز هویت الزامی است", 401));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.userJwtSecret) as UserJwtPayload;
    req.user = payload;
    next();
  } catch {
    next(new AppError("توکن نامعتبر است", 401));
  }
}

export function authenticateAdmin(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next(new AppError("احراز هویت ادمین الزامی است", 401));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.adminJwtSecret) as AdminJwtPayload;
    req.admin = payload;
    next();
  } catch {
    next(new AppError("توکن ادمین نامعتبر است", 401));
  }
}

export function signUserToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, config.userJwtSecret, {
    expiresIn: config.userJwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, config.adminJwtSecret, {
    expiresIn: config.adminJwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}
