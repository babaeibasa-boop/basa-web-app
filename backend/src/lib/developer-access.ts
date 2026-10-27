import { Prisma } from "@prisma/client";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";
import { isIranianMobile, normalizePhone, parseIranianMobile } from "./phone.js";

const CACHE_TTL_MS = 30_000;

type PhoneCache = {
  phones: Set<string>;
  expiresAt: number;
  generation: number;
};

let generation = 0;
let cache: PhoneCache | null = null;
let pending: { generation: number; promise: Promise<Set<string>> } | null = null;

export function clearDeveloperPhoneCache(): void {
  generation += 1;
  cache = null;
  pending = null;
}

async function developerPhoneSet(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now && cache.generation === generation) {
    return cache.phones;
  }

  const seen = generation;
  if (!pending || pending.generation !== seen) {
    const promise = prisma.developerPhone
      .findMany({ select: { phone: true } })
      .then((rows) => {
        const phones = new Set(rows.map((row) => row.phone));
        if (generation === seen) {
          cache = { phones, expiresAt: Date.now() + CACHE_TTL_MS, generation: seen };
        }
        return phones;
      })
      .finally(() => {
        if (pending?.generation === seen) pending = null;
      });
    pending = { generation: seen, promise };
  }

  return pending.promise;
}

export async function isDeveloperPhone(phone: string): Promise<boolean> {
  if (!isIranianMobile(phone)) return false;
  const phones = await developerPhoneSet();
  return phones.has(normalizePhone(phone));
}

export async function listDeveloperPhones() {
  return prisma.developerPhone.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function addDeveloperPhone(phone: string) {
  const normalized = parseIranianMobile(phone);
  try {
    const created = await prisma.developerPhone.create({ data: { phone: normalized } });
    clearDeveloperPhoneCache();
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      clearDeveloperPhoneCache();
      throw new AppError("این شماره قبلاً ثبت شده است", 409);
    }
    throw error;
  }
}

export async function removeDeveloperPhone(id: string) {
  const existing = await prisma.developerPhone.findUnique({ where: { id } });
  if (!existing) throw new AppError("شماره یافت نشد", 404);
  await prisma.developerPhone.delete({ where: { id } });
  clearDeveloperPhoneCache();
}
