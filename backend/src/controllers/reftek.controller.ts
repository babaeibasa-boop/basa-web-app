import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../lib/response.js";
import { launchReftekApp, listReftekApps } from "../services/reftek.service.js";

export async function listApps(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, listReftekApps());
  } catch (error) {
    next(error);
  }
}

export async function launchApp(req: Request, res: Response, next: NextFunction) {
  try {
    const appId = String(req.params.appId);
    const result = await launchReftekApp(appId, req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
