import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { config } from "../lib/config.js";
import { AppError } from "../lib/errors.js";

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 5;
const MAX_STORE_SIZE = 20_000;
const PURGE_INTERVAL_MS = 30_000;
/** Exclude ambiguous characters: 0/O, 1/I/l */
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface CaptchaChallenge {
  answerHash: string;
  expiresAt: number;
}

const challenges = new Map<string, CaptchaChallenge>();
let lastPurgeAt = 0;

function hashAnswer(answer: string): string {
  return createHmac("sha256", config.userJwtSecret)
    .update(`captcha:${answer.toUpperCase()}`)
    .digest("hex");
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CAPTCHA_LENGTH; i += 1) {
    code += CAPTCHA_CHARS[randomInt(CAPTCHA_CHARS.length)]!;
  }
  return code;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSvg(code: string): string {
  const width = 160;
  const height = 56;
  const chars = code.split("");
  const charGap = width / (chars.length + 1);

  const noiseLines = Array.from({ length: 6 }, () => {
    const x1 = randomInt(width);
    const y1 = randomInt(height);
    const x2 = randomInt(width);
    const y2 = randomInt(height);
    const color = `rgb(${80 + randomInt(100)},${80 + randomInt(100)},${80 + randomInt(100)})`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2" opacity="0.55"/>`;
  }).join("");

  const noiseDots = Array.from({ length: 18 }, () => {
    const cx = randomInt(width);
    const cy = randomInt(height);
    const r = 0.8 + randomInt(20) / 10;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${100 + randomInt(120)},${100 + randomInt(120)},${100 + randomInt(120)})" opacity="0.45"/>`;
  }).join("");

  const letters = chars
    .map((char, index) => {
      const x = charGap * (index + 1);
      const y = 32 + (randomInt(10) - 5);
      const rotate = randomInt(36) - 18;
      const fontSize = 22 + randomInt(6);
      const fill = `rgb(${30 + randomInt(60)},${30 + randomInt(60)},${30 + randomInt(60)})`;
      return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" font-family="monospace" font-weight="700" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${escapeXml(char)}</text>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="captcha">`,
    `<rect width="100%" height="100%" fill="#f3f4f6"/>`,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#d1d5db" stroke-width="1"/>`,
    noiseLines,
    noiseDots,
    letters,
    `</svg>`,
  ].join("");
}

function purgeExpired(force = false): void {
  const now = Date.now();
  if (!force && now - lastPurgeAt < PURGE_INTERVAL_MS && challenges.size < MAX_STORE_SIZE) {
    return;
  }
  lastPurgeAt = now;
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) {
      challenges.delete(id);
    }
  }
}

export function createCaptcha(): { captchaId: string; svg: string } {
  purgeExpired();
  if (challenges.size >= MAX_STORE_SIZE) {
    purgeExpired(true);
  }
  if (challenges.size >= MAX_STORE_SIZE) {
    throw new AppError("سرویس موقتاً در دسترس نیست. لطفاً کمی بعد تلاش کنید", 503);
  }

  const code = generateCode();
  const captchaId = randomBytes(16).toString("hex");
  challenges.set(captchaId, {
    answerHash: hashAnswer(code),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });
  return { captchaId, svg: renderSvg(code) };
}

export function verifyCaptcha(captchaId: string, answer: string): void {
  if (!captchaId || captchaId.length > 64 || answer.length > 16) {
    throw new AppError("کپچا منقضی شده است. لطفاً دوباره تلاش کنید", 400);
  }

  const challenge = challenges.get(captchaId);
  // Consume immediately to prevent replay even on wrong answers after first try.
  challenges.delete(captchaId);

  if (!challenge || challenge.expiresAt <= Date.now()) {
    throw new AppError("کپچا منقضی شده است. لطفاً دوباره تلاش کنید", 400);
  }

  const expected = Buffer.from(challenge.answerHash, "hex");
  const actual = Buffer.from(hashAnswer(answer.trim()), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError("کد کپچا نادرست است", 400);
  }
}

/** Test helper: clear in-memory challenges. */
export function clearCaptchaStore(): void {
  challenges.clear();
  lastPurgeAt = 0;
}

/** Test helper: peek remaining challenges count. */
export function captchaStoreSize(): number {
  return challenges.size;
}

/** Test helper: inject a known captcha challenge. */
export function setCaptchaForTests(captchaId: string, answer: string, ttlMs = CAPTCHA_TTL_MS): void {
  challenges.set(captchaId, {
    answerHash: hashAnswer(answer),
    expiresAt: Date.now() + ttlMs,
  });
}
