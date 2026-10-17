import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { creditApi } from "@/api";
import { CreditsLayout } from "@/components/layout/layout";
import { MarkdownContent } from "@/components/credits/markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate, formatPrice } from "@/lib/utils";

const TX_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "خرید",
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
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-4 h-28 w-full" />
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

  return (
    <CreditsLayout>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/credits")}>
        بازگشت
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <img src={platform.logoUrl} alt="" className="h-14 w-14 rounded-lg object-contain" />
          <div>
            <h2 className="text-xl font-bold">{platform.name}</h2>
            {balanceQuery.isLoading && <Skeleton className="mt-1 h-6 w-32" />}
            {balanceQuery.data?.data && (
              <p className="text-lg font-bold text-primary">
                {formatPrice(balanceQuery.data.data.available)}
              </p>
            )}
            {balanceQuery.error && (
              <p className="text-sm text-destructive">{balanceQuery.error.message}</p>
            )}
          </div>
        </div>
        {platform.hasLaunch && (
          <Button
            disabled={launchMutation.isPending}
            onClick={() => launchMutation.mutate()}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {launchMutation.isPending ? "در حال انتقال..." : "استفاده از اعتبار"}
          </Button>
        )}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
              currentTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === "transactions" && <TransactionsTab slug={slug!} />}
      {currentTab === "installments" && <InstallmentsTab slug={slug!} />}
      {currentTab === "merchants" && (
        <MerchantsTab slug={slug!} query={merchantQuery} onQueryChange={setMerchantQuery} />
      )}
      {currentTab === "instructions" && (
        <Card>
          <CardContent className="p-4">
            {platform.instructions.trim() ? (
              <MarkdownContent content={platform.instructions} />
            ) : (
              <EmptyState title="راهنمایی ثبت نشده" />
            )}
          </CardContent>
        </Card>
      )}
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
      {items.map((tx) => (
        <div key={tx.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{tx.description || TX_TYPE_LABELS[tx.type] || tx.type}</p>
              <p className="text-xs text-muted-foreground">{formatDate(tx.occurredAt)}</p>
              {tx.merchantName && (
                <p className="text-xs text-muted-foreground">{tx.merchantName}</p>
              )}
            </div>
            <div className="text-left shrink-0">
              <p className="font-bold" dir="ltr">
                {formatPrice(tx.amount)}
              </p>
              <Badge variant="secondary" className="mt-1">
                {TX_STATUS_LABELS[tx.status] ?? tx.status}
              </Badge>
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
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">جزئیات اقساط در سایت پلتفرم قابل مشاهده است.</p>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            مشاهده اقساط
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>
    );
  }

  if (data.items.length === 0) {
    return <EmptyState title="قسطی یافت نشد" />;
  }

  return (
    <div className="space-y-2">
      {data.items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">{item.label || "قسط"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(item.dueAt)}</p>
          </div>
          <div className="text-left">
            <p className="font-bold">{formatPrice(item.amount)}</p>
            <Badge variant="secondary">{INSTALLMENT_STATUS_LABELS[item.status] ?? item.status}</Badge>
          </div>
        </div>
      ))}
    </div>
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
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">لیست پذیرندگان در سایت پلتفرم قابل مشاهده است.</p>
          <a
            href={first.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            مشاهده پذیرندگان
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>
    );
  }

  const items = merchantsQuery.data?.pages.flatMap((page) =>
    page.data.mode === "api" ? page.data.items : [],
  ) ?? [];

  return (
    <div className="space-y-3">
      <Input
        placeholder="جستجوی پذیرنده..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {items.length === 0 && <EmptyState title="پذیرنده‌ای یافت نشد" />}
      <div className="space-y-2">
        {items.map((merchant) => (
          <div key={merchant.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{merchant.name}</p>
              {merchant.category && (
                <p className="text-xs text-muted-foreground">{merchant.category}</p>
              )}
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
