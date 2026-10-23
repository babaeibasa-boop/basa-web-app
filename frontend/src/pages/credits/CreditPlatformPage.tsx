import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ExternalLink,
  Receipt,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { creditApi } from "@/api";
import { CreditsLayout } from "@/components/layout/layout";
import { MarkdownContent } from "@/components/credits/markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate, formatPrice } from "@/lib/utils";

const TAB_ICONS = {
  transactions: Receipt,
  installments: CalendarClock,
  merchants: Store,
  instructions: BookOpen,
} as const;

const TX_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "برداشت",
  REFUND: "بازگشت",
  CHARGE: "شارژ",
  INSTALLMENT_PAYMENT: "پرداخت قسط",
  OTHER: "سایر",
};

const TX_STATUS_LABELS: Record<string, string> = {
  SUCCESS: "موفق",
  PENDING: "در انتظار",
  FAILED: "ناموفق",
};

const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PAID: "پرداخت‌شده",
  DUE: "سررسید",
  OVERDUE: "معوق",
  UPCOMING: "آینده",
};

type TabKey = "transactions" | "installments" | "merchants" | "instructions";

export default function CreditPlatformPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [merchantQuery, setMerchantQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("transactions");

  const platformQuery = useQuery({
    queryKey: ["credit-platform", slug],
    queryFn: () => creditApi.getPlatform(slug!),
    enabled: !!slug,
  });

  const balanceQuery = useQuery({
    queryKey: ["credit-balance", slug],
    queryFn: () => creditApi.getBalance(slug!),
    enabled: !!slug,
  });

  const platform = platformQuery.data?.data;

  const tabs = useMemo(() => {
    if (!platform) return [] as { key: TabKey; label: string }[];
    const items: { key: TabKey; label: string }[] = [
      { key: "transactions", label: "تراکنش‌ها" },
    ];
    if (platform.installmentsMode !== "DISABLED") {
      items.push({ key: "installments", label: "اقساط" });
    }
    if (platform.merchantsMode !== "DISABLED") {
      items.push({ key: "merchants", label: "پذیرندگان" });
    }
    items.push({ key: "instructions", label: "راهنما" });
    return items;
  }, [platform]);

  const currentTab = tabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : (tabs[0]?.key ?? "transactions");

  const launchMutation = useMutation({
    mutationFn: () => creditApi.launch(slug!),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  if (platformQuery.isLoading) {
    return (
      <CreditsLayout>
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="mt-4 h-52 w-full rounded-[1.75rem]" />
        <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
      </CreditsLayout>
    );
  }

  if (platformQuery.error || !platform) {
    return (
      <CreditsLayout>
        <EmptyState title="پلتفرم یافت نشد" />
      </CreditsLayout>
    );
  }

  const balance = balanceQuery.data?.data;

  return (
    <CreditsLayout>
      <Button
        variant="outline"
        size="sm"
        className="mb-4 rounded-full bg-card/80 shadow-sm backdrop-blur"
        onClick={() => navigate("/credits")}
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت
      </Button>

      <section className="animate-credit-rise relative mb-5 overflow-hidden rounded-[1.75rem] p-5 text-white shadow-xl shadow-indigo-900/20 sm:p-6">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(125deg,#0f172a,#4338ca,#7c3aed,#0f172a)] bg-[length:220%_220%] motion-safe:animate-credit-pan"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 top-0 h-32 w-32 rounded-full bg-white/15 blur-2xl motion-safe:animate-credit-float"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src={platform.logoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-lg"
            />
            <div className="min-w-0">
              <p className="text-xs text-white/70">پلتفرم اعتباری</p>
              <h2 className="text-2xl font-bold">{platform.name}</h2>
              {balanceQuery.isLoading && <Skeleton className="mt-2 h-8 w-36 bg-white/20" />}
              {balance && (
                <>
                  <p className="mt-2 text-xs text-white/70">موجودی قابل استفاده</p>
                  <p className="text-xl md:text-3xl font-bold tracking-tight">
                    <span className="inline-block" dir="ltr">
                      {formatPrice(balance.available)}
                    </span>
                  </p>
                  {balance.expiresAt && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-white/80">
                      <CalendarClock className="h-3.5 w-3.5" />
                      انقضا: {formatDate(balance.expiresAt)}
                    </p>
                  )}
                </>
              )}
              {balanceQuery.error && (
                <p className="mt-2 text-sm text-rose-100">{balanceQuery.error.message}</p>
              )}
            </div>
          </div>
          {platform.hasLaunch && (
            <Button
              disabled={launchMutation.isPending}
              onClick={() => launchMutation.mutate()}
              className="shrink-0 bg-white text-indigo-700 hover:bg-white/90"
            >
              {launchMutation.isPending ? (
                "در حال انتقال..."
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  استفاده از اعتبار
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </section>

      <div className="p-1 mb-4 bg-card/80 shadow-sm backdrop-blur rounded-2xl border">
        <div className=" flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            const active = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div key={currentTab} className="animate-credit-rise">
        {currentTab === "transactions" && <TransactionsTab slug={slug!} />}
        {currentTab === "installments" && <InstallmentsTab slug={slug!} />}
        {currentTab === "merchants" && (
          <MerchantsTab slug={slug!} query={merchantQuery} onQueryChange={setMerchantQuery} />
        )}
        {currentTab === "instructions" && (
          <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur">
            <CardContent className="p-5">
              {platform.instructions.trim() ? (
                <MarkdownContent content={platform.instructions} />
              ) : (
                <EmptyState title="راهنمایی ثبت نشده" />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </CreditsLayout>
  );
}

function TransactionsTab({ slug }: { slug: string }) {
  const query = useInfiniteQuery({
    queryKey: ["credit-transactions", slug],
    queryFn: ({ pageParam }) => creditApi.getTransactions(slug, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (query.error) {
    return <EmptyState title="خطا در دریافت تراکنش‌ها" description={query.error.message} />;
  }

  if (items.length === 0) {
    return <EmptyState title="تراکنشی یافت نشد" />;
  }

  return (
    <div className="space-y-2">
      {items.map((tx, index) => (
        <div
          key={tx.id}
          style={{ animationDelay: `${index * 40}ms` }}
          className="animate-credit-rise rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur transition-colors hover:border-primary/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{tx.description}</p>
              <p className="text-xs text-muted-foreground">{formatDate(tx.occurredAt)}</p>
              {tx.merchantName && (
                <p className="text-xs text-muted-foreground">{tx.merchantName}</p>
              )}
              <Badge
                variant={
                  tx.status === "SUCCESS" ? "success" : tx.status === "FAILED" ? "destructive" : "warning"
                }
                className="mt-1"
              >
                {TX_STATUS_LABELS[tx.status] ?? tx.status}
              </Badge>
            </div>
            <div className="shrink-0 text-left">
              <p
                className={cn(
                  "font-bold"
                  ,
                  "text-foreground",

                )}
                dir="ltr"
              >
                {formatPrice(tx.amount)}
              </p>
              <span
                // variant="secondary"
                className={cn(
                  "mt-1 font-bold text-[12px]",
                  tx.type === "REFUND" || tx.type === "CHARGE"
                    ? "text-emerald-400 dark:text-emerald-800"
                    : "text-rose-400 dark:text-rose-800"
                )}
              >
                {TX_TYPE_LABELS[tx.type] || tx.type}
              </span>
            </div>
          </div>
        </div>
      ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "در حال بارگذاری..." : "بیشتر"}
        </Button>
      )}
    </div>
  );
}

function InstallmentsTab({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ["credit-installments", slug],
    queryFn: () => creditApi.getInstallments(slug),
  });

  if (query.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (query.error) {
    return <EmptyState title="خطا در دریافت اقساط" description={query.error.message} />;
  }

  const data = query.data?.data;
  if (!data) return null;

  if (data.mode === "redirect") {
    return <RedirectPanel text="جزئیات اقساط در سایت پلتفرم قابل مشاهده است." href={data.url} label="مشاهده اقساط" />;
  }

  if (data.items.length === 0) {
    return <EmptyState title="قسطی یافت نشد" />;
  }

  return (
    <div className="space-y-2">
      {data.items.map((item, index) => (
        <div
          key={item.id}
          style={{ animationDelay: `${index * 40}ms` }}
          className="animate-credit-rise flex items-center justify-between gap-3 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur"
        >
          <div>
            <p className="font-medium">{item.label || "قسط"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(item.dueAt)}</p>
          </div>
          <div className="text-left">
            <p className="font-bold">{formatPrice(item.amount)}</p>
            <Badge
              variant={
                item.status === "PAID"
                  ? "success"
                  : item.status === "OVERDUE"
                    ? "destructive"
                    : item.status === "DUE"
                      ? "warning"
                      : "secondary"
              }
            >
              {INSTALLMENT_STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function RedirectPanel({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardContent className="flex flex-col items-start gap-3 p-5">
        <p className="text-sm text-muted-foreground">{text}</p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          {label}
          <ExternalLink className="h-4 w-4" />
        </a>
      </CardContent>
    </Card>
  );
}

function MerchantsTab({
  slug,
  query,
  onQueryChange,
}: {
  slug: string;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const merchantsQuery = useInfiniteQuery({
    queryKey: ["credit-merchants", slug, query],
    queryFn: ({ pageParam }) =>
      creditApi.getMerchants(slug, {
        cursor: pageParam,
        q: query.trim() || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.data.mode === "api" ? (last.data.nextCursor ?? undefined) : undefined,
  });

  if (merchantsQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (merchantsQuery.error) {
    return <EmptyState title="خطا در دریافت پذیرندگان" description={merchantsQuery.error.message} />;
  }

  const first = merchantsQuery.data?.pages[0]?.data;
  if (!first) return null;

  if (first.mode === "redirect") {
    return (
      <RedirectPanel
        text="لیست پذیرندگان در سایت پلتفرم قابل مشاهده است."
        href={first.url}
        label="مشاهده پذیرندگان"
      />
    );
  }

  const items = merchantsQuery.data?.pages.flatMap((page) =>
    page.data.mode === "api" ? page.data.items : [],
  ) ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="جستجوی پذیرنده..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="rounded-2xl bg-card/80 ps-9"
        />
      </div>
      {items.length === 0 && <EmptyState title="پذیرنده‌ای یافت نشد" />}
      <div className="space-y-2">
        {items.map((merchant, index) => (
          <div
            key={merchant.id}
            style={{ animationDelay: `${index * 40}ms` }}
            className="animate-credit-rise flex items-center justify-between gap-3 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex min-w-0 items-center gap-3">
              {merchant.logoUrl ? (
                <img src={merchant.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Store className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{merchant.name}</p>
                {merchant.category && (
                  <p className="text-xs text-muted-foreground">{merchant.category}</p>
                )}
              </div>
            </div>
            {merchant.url && (
              <a
                href={merchant.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary"
                aria-label={merchant.name}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
      </div>
      {merchantsQuery.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={merchantsQuery.isFetchingNextPage}
          onClick={() => merchantsQuery.fetchNextPage()}
        >
          {merchantsQuery.isFetchingNextPage ? "در حال بارگذاری..." : "بیشتر"}
        </Button>
      )}
    </div>
  );
}
