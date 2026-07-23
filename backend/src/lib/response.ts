import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export function sendSuccess<T>(res: Response, data: T, message = "", statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data } satisfies ApiResponse<T>);
}

export function sendError(res: Response, message: string, statusCode = 400): void {
  res.status(statusCode).json({ success: false, message, data: null } satisfies ApiResponse<null>);
}
