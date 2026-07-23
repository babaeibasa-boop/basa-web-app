# AI Subscription Store

فروشگاه اشتراک هوش مصنوعی — یک اپلیکیشن مستقل برای خرید اشتراک ChatGPT، Claude و Gemini با موجودی کیف پول.

## ساختار پروژه

دو اپلیکیشن مستقل که هر کدام روی هاست جداگانه deploy می‌شوند:

```
frontend/   → React + Vite + TypeScript (هاست فرانت‌اند)
backend/    → Express + Prisma + PostgreSQL (هاست بک‌اند)
              دیتابیس PostgreSQL روی هاست سوم
```

## پیش‌نیازها

- Node.js 20+
- PostgreSQL 15+

## راه‌اندازی بک‌اند

```bash
cd backend
cp .env.example .env
# ویرایش .env با مقادیر واقعی
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

بک‌اند روی `http://localhost:3001` اجرا می‌شود.

## راه‌اندازی فرانت‌اند

```bash
cd frontend
cp .env.example .env
# ویرایش VITE_API_BASE_URL
npm install
npm run dev
```

فرانت‌اند روی `http://localhost:5173` اجرا می‌شود.

## Deploy

هر اپلیکیشن مستقل است:

- **فرانت‌اند**: `npm run build` → فایل‌های `dist/` را روی CDN/هاست استاتیک قرار دهید
- **بک‌اند**: `npm run build && npm run db:deploy && npm start`
- **دیتابیس**: `DATABASE_URL` را به هاست PostgreSQL اشاره دهید

## متغیرهای محیطی

| اپ | متغیر | توضیح |
|---|---|---|
| frontend | `VITE_API_BASE_URL` | آدرس API بک‌اند |
| backend | `DATABASE_URL` | اتصال PostgreSQL |
| backend | `FRONTEND_URL` | آدرس فرانت‌اند (CORS) |
| backend | `WALLET_API_*` | تنظیمات API کیف پول |

## مراحل توسعه

پروژه به صورت feature-by-feature ساخته شده است. هر مرحله مستقل و قابل تست است.
