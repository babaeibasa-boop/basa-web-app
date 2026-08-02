import type { Request, Response, NextFunction } from "express";
import { config } from "../../../lib/config.js";

export function authenticateTopApiPwd(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.pwd;
  const pwd = Array.isArray(header) ? header[0] : header;

  if (!pwd || pwd !== config.topApiToken) {
    res.status(401).json({ error_status: "INVALID_PWD" });
    return;
  }

  next();
}
