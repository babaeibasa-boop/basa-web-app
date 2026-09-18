import { AppError } from "./errors.js";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlug(slug: string, entityLabel = "شناسه") {
  if (!SLUG_PATTERN.test(slug)) {
    throw new AppError(`${entityLabel} فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد`, 400);
  }
}
