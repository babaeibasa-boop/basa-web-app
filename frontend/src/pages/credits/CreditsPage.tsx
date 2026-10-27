import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  Layers,
  Sparkles,
  Store,
  WalletCards,
} from "lucide-react";
import { creditApi } from "@/api";
import { CreditsLayout } from "@/components/layout/layout";
import { Badge, EmptyState } from "@/components/ui/badge";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import type { CreditPlatformSummary } from "@/types";

const CARD_THEMES = [
  "from-sky-400 via-blue-600 to-indigo-800",
  "from-emerald-400 via-teal-600 to-cyan-800",
  "from-rose-400 via-pink-600 to-fuchsia-800",
  "from-amber-400 via-orange-600 to-rose-700",
  "from-violet-400 via-purple-600 to-fuchsia-900",
  "from-slate-500 via-indigo-700 to-violet-950",
];

function useCountUp(value: number) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const duration = 1100;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

function usePointerLight<T extends HTMLElement>(tilt = false) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
      if (tilt) {
        el.style.setProperty("--rx", `${((50 - y) / 50) * 8}deg`);
        el.style.setProperty("--ry", `${((x - 50) / 50) * 10}deg`);
      }
    };
    const leave = () => {
      el.style.setProperty("--mx", "30%");
      el.style.setProperty("--my", "0%");
      if (tilt) {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      }
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [tilt]);

  return ref;
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function expiryText(iso: string) {
  const days = daysUntil(iso);
  if (Number.isNaN(days)) return formatDate(iso);
  if (days < 0) return "منقضی شده";
  if (days === 0) return "امروز منقضی می‌شود";
  if (days <= 45) return `${new Intl.NumberFormat("fa-IR").format(days)} روز مانده`;
  return `تا ${formatDate(iso)}`;
}

function LogoMark({ src, name, className }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-white/20 text-base font-bold text-white",
          className,
        )}
      >
        {name.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={cn("bg-white object-contain p-1", className)}
    />
  );
}

function StatTile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const animated = useCountUp(value);
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-md">
      <span className="text-white/80">{icon}</span>
      <span className="text-base font-bold leading-none">
        {new Intl.NumberFormat("fa-IR").format(animated)}
      </span>
      <span className="text-[11px] text-white/70">{label}</span>
    </div>
  );
}

function SummaryHero({ platforms }: { platforms: CreditPlatformSummary[] }) {
  const cardRef = usePointerLight<HTMLElement>(true);
  const ready = platforms.filter((platform) => platform.balance);
  const failed = platforms.length - ready.length;
  const total = ready.reduce((sum, platform) => sum + (platform.balance?.available ?? 0), 0);
  const animatedTotal = useCountUp(total);
  const soonest = ready
    .flatMap((platform) => {
      const expiresAt = platform.balance?.expiresAt;
      if (!expiresAt) return [];
      const days = daysUntil(expiresAt);
      if (Number.isNaN(days) || days < 0 || days > 14) return [];
      return [{ name: platform.name, days }];
    })
    .sort((a, b) => a.days - b.days)[0];

  return (
    <div className="animate-credit-rise relative pt-5 [perspective:1400px]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-[2rem] bg-gradient-to-l from-fuchsia-500/70 to-indigo-500/70 opacity-80 blur-[1px] motion-safe:animate-credit-sway"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-2.5 h-28 rounded-[2rem] bg-gradient-to-l from-sky-400/50 to-violet-600/60"
      />

      <section
        ref={cardRef}
        className="relative overflow-hidden rounded-[1.9rem] p-[1.5px] shadow-2xl shadow-indigo-950/30 transition-transform duration-200 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] motion-reduce:transform-none"
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-[1.9rem] bg-[conic-gradient(from_var(--credit-angle),#67e8f9,#818cf8,#f0abfc,#67e8f9)] motion-safe:animate-credit-spin"
        />
        <div className="relative overflow-hidden rounded-[1.85rem] bg-slate-950 px-5 py-6 text-white sm:px-7 sm:py-7">
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(125deg,#020617,#312e81,#7c3aed,#020617)] bg-[length:240%_240%] motion-safe:animate-credit-pan"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_circle_at_var(--mx,28%)_var(--my,0%),rgba(255,255,255,0.34),transparent_42%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-10 top-6 h-36 w-36 rounded-full bg-cyan-300/30 blur-3xl motion-safe:animate-credit-float"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 right-0 h-44 w-44 rounded-full bg-fuchsia-400/30 blur-3xl motion-safe:animate-credit-drift"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.45)_0.6px,transparent_0.6px)] [background-size:4px_4px]"
          />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-white/75">
                <Sparkles className="h-3.5 w-3.5" />
                کیف اعتبار
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">اعتبار من</h2>
            </div>
            <div className="flex items-center gap-3">
              {platforms.length > 0 && (
                <div className="flex items-center">
                  {platforms.slice(0, 4).map((platform, index, list) => (
                    <span
                      key={platform.id}
                      className={cn(
                        "relative transition duration-300 motion-safe:hover:-translate-y-1",
                        index < list.length - 1 && "-me-2.5",
                      )}
                      style={{ zIndex: list.length - index }}
                    >
                      <LogoMark
                        src={platform.logoUrl}
                        name={platform.name}
                        className="h-9 w-9 rounded-full p-0.5 ring-2 ring-white/70"
                      />
                    </span>
                  ))}
                </div>
              )}
              <span className="relative hidden h-12 w-12 sm:flex">
                <span className="absolute inset-0 rounded-full border border-white/30 motion-safe:animate-credit-orbit" />
                <span className="absolute inset-1.5 rounded-full border border-dashed border-white/25 motion-safe:animate-credit-orbit-reverse" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <WalletCards className="h-4 w-4 text-white/90" />
                </span>
              </span>
            </div>
          </div>

          <div className="relative mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-white/70">مجموع موجودی قابل استفاده</p>
              <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl" aria-label={formatPrice(total)}>
                <span aria-hidden className="inline-block" dir="ltr">
                  {formatPrice(animatedTotal)}
                </span>
              </p>
            </div>
            <div aria-hidden className="mb-1 hidden h-10 items-end gap-1 sm:flex">
              {[18, 28, 16, 34, 22, 30].map((height, index) => (
                <span
                  key={height + index}
                  className="w-1 rounded-full bg-white/70 motion-safe:animate-credit-bar"
                  style={{ height, animationDelay: `${index * 140}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="relative mt-6 flex flex-wrap gap-2">
            <StatTile label="پلتفرم" value={platforms.length} icon={<Layers className="h-3.5 w-3.5" />} />
            <StatTile label="موجودی فعال" value={ready.length} icon={<Sparkles className="h-3.5 w-3.5" />} />
            {failed > 0 && (
              <StatTile label="ناموجود" value={failed} icon={<AlertCircle className="h-3.5 w-3.5" />} />
            )}
          </div>

          {soonest && (
            <p className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-rose-600 motion-safe:animate-pulse">
              <CalendarClock className="h-3.5 w-3.5" />
              {soonest.name}:{" "}
              {soonest.days === 0
                ? "امروز منقضی می‌شود"
                : `${new Intl.NumberFormat("fa-IR").format(soonest.days)} روز تا انقضا`}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PlatformCard({ platform, index }: { platform: CreditPlatformSummary; index: number }) {
  const cardRef = usePointerLight<HTMLElement>(false);
  const balance = platform.balance;
  const ratio =
    balance?.total && balance.total > 0 ? Math.min(1, Math.max(0, balance.available / balance.total)) : null;
  const expiringSoon = balance?.expiresAt ? daysUntil(balance.expiresAt) <= 14 : false;
  const [ring, setRing] = useState(0);

  useEffect(() => {
    if (ratio === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRing(ratio);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - progress) ** 3;
      setRing(ratio * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ratio]);

  return (
    <Link
      to={`/credits/${encodeURIComponent(platform.slug)}`}
      style={{ animationDelay: `${160 + index * 90}ms` }}
      className="animate-credit-rise group block h-full rounded-[1.75rem] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {balance ? (
        <article
          ref={cardRef}
          className={cn(
            "relative flex h-full min-h-52 flex-col overflow-hidden rounded-[1.75rem] bg-gradient-to-bl p-5 text-white shadow-lg shadow-black/15 transition duration-500 motion-safe:group-hover:-translate-y-1.5 motion-safe:group-hover:shadow-2xl",
            CARD_THEMES[index % CARD_THEMES.length],
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(280px_circle_at_var(--mx,20%)_var(--my,0%),rgba(255,255,255,0.38),transparent_46%)] opacity-80"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[-40%] -end-[55%] w-1/2 rotate-12 bg-gradient-to-l from-transparent via-white/40 to-transparent opacity-0 transition duration-700 motion-safe:group-hover:end-[130%] motion-safe:group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-10 -start-8 h-28 w-28 rounded-full bg-white/20 blur-2xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.7)_0.55px,transparent_0.55px)] [background-size:3px_3px]"
          />

          <div className="relative flex items-center gap-3">
            <LogoMark
              src={platform.logoUrl}
              name={platform.name}
              className="h-12 w-12 shrink-0 rounded-2xl shadow-md ring-1 ring-white/40"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold">{platform.name}</p>
                {!platform.isActive && (
                  <Badge variant="warning" className="shrink-0">
                    غیرفعال
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-white/70" dir="ltr">
                {platform.slug}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 transition duration-300 motion-safe:group-hover:-translate-x-1 motion-safe:group-hover:bg-white/25">
              <ChevronLeft className="h-4 w-4" />
            </span>
          </div>

          <p className="relative mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="inline-block" dir="ltr">
              {formatPrice(balance.available)}
            </span>
          </p>
          <p className="relative text-xs text-white/75">موجودی قابل استفاده</p>

          <div className="relative mt-auto flex items-end justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {balance.expiresAt && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]",
                    expiringSoon ? "bg-white text-rose-600 motion-safe:animate-pulse" : "bg-white/15",
                  )}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {expiryText(balance.expiresAt)}
                </span>
              )}
              {platform.hasLaunch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                  <Sparkles className="h-3.5 w-3.5" />
                  قابل استفاده
                </span>
              )}
              {platform.merchantsMode !== "DISABLED" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                  <Store className="h-3.5 w-3.5" />
                  پذیرندگان
                </span>
              )}
            </div>
            {ratio !== null && (
              <div
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full p-[3px] shadow-inner"
                style={{
                  background: `conic-gradient(rgba(255,255,255,0.95) ${ring * 360}deg, rgba(255,255,255,0.22) 0deg)`,
                }}
                aria-label={`سهم باقی‌مانده ${new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 0 }).format(ratio)}`}
              >
                <span className="grid h-full w-full place-items-center rounded-full bg-black/25 text-[10px] font-semibold backdrop-blur-sm">
                  {new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 0 }).format(ratio)}
                </span>
              </div>
            )}
          </div>
        </article>
      ) : (
        <article
          ref={cardRef}
          className="relative flex h-full min-h-52 flex-col overflow-hidden rounded-[1.75rem] border border-destructive/25 bg-card/80 p-5 shadow-sm backdrop-blur transition duration-500 motion-safe:group-hover:-translate-y-1.5 motion-safe:group-hover:shadow-lg"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(240px_circle_at_var(--mx,20%)_var(--my,0%),rgba(244,63,94,0.16),transparent_50%)]"
          />
          <div className="relative flex items-center gap-3">
            <LogoMark
              src={platform.logoUrl}
              name={platform.name}
              className="h-12 w-12 shrink-0 rounded-2xl bg-muted text-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{platform.name}</p>
                {!platform.isActive && (
                  <Badge variant="warning" className="shrink-0">
                    غیرفعال
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">موجودی دریافت نشد</p>
            </div>
            <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground transition duration-300 motion-safe:group-hover:-translate-x-1" />
          </div>
          <div className="relative mt-auto flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{platform.error ?? "موجودی در دسترس نیست"}</p>
          </div>
        </article>
      )}
    </Link>
  );
}

function CreditsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="credit-skeleton animate-credit-shimmer mt-5 h-64 rounded-[1.9rem]" />
      <div className="space-y-4">
        <div className="credit-skeleton animate-credit-shimmer h-52 rounded-[1.75rem]" />
        <div className="credit-skeleton animate-credit-shimmer h-52 rounded-[1.75rem]" />
      </div>
    </div>
  );
}

export default function CreditsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["credit-platforms"],
    queryFn: () => creditApi.getPlatforms(),
  });

  const platforms = data?.data ?? [];

  return (
    <CreditsLayout>
      {isLoading && <CreditsSkeleton />}

      {error && <EmptyState title="خطا در دریافت پلتفرم‌ها" description={error.message} />}

      {!isLoading && !error && platforms.length === 0 && (
        <div className="animate-credit-rise relative overflow-hidden rounded-[1.9rem] border border-dashed bg-card/70 px-6 py-16 text-center shadow-sm">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-8 h-16 w-28 -translate-x-1/2 rotate-[-8deg] rounded-2xl bg-gradient-to-bl from-sky-400 to-indigo-600 opacity-80 motion-safe:animate-credit-float"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-12 h-16 w-28 -translate-x-1/2 rotate-[7deg] rounded-2xl bg-gradient-to-bl from-fuchsia-400 to-violet-700 opacity-80 motion-safe:animate-credit-sway"
          />
          <span className="relative mt-12 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <WalletCards className="h-8 w-8" />
          </span>
          <p className="relative text-lg font-medium">پلتفرمی ثبت نشده</p>
          <p className="relative mt-1 text-sm text-muted-foreground">هنوز پلتفرم اعتباری فعالی وجود ندارد</p>
        </div>
      )}

      {!isLoading && !error && platforms.length > 0 && (
        <>
          <SummaryHero platforms={platforms} />
          <div className="mt-8">
            <div className="mb-4 flex items-end justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <h3 className="text-base font-bold">اعتبارات</h3>
              </div>
              <p className="text-xs text-muted-foreground">برای جزئیات، یک کارت را باز کنید</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {platforms.map((platform, index) => (
                <PlatformCard key={platform.id} platform={platform} index={index} />
              ))}
            </div>
          </div>
        </>
      )}
    </CreditsLayout>
  );
}
