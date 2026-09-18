import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { voucherApi } from "@/api";
import { VoucherLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatDurationMonths, formatPrice, formatVoucherExpiry, VOUCHER_PURCHASE_STATUS_LABELS } from "@/lib/utils";

function statusVariant(status: string) {
  switch (status) {
    case "PAID":
      return "success" as const;
    case "CANCELLED":
      return "destructive" as const;
    default:
      return "warning" as const;
  }
}

export default function VoucherPurchasesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["voucher-purchases"],
    queryFn: () => voucherApi.getPurchases(),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => voucherApi.payPurchase(id),
    onSuccess: (res) => {
      window.location.href = res.data.payUrl;
    },
    onError: (err: Error) => {
      toast(err.message, "destructive");
      queryClient.invalidateQueries({ queryKey: ["voucher-purchases"] });
    },
  });

  const purchases = data?.data ?? [];

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast("کد کپی شد");
    } catch {
      toast("کپی کد انجام نشد", "destructive");
    }
  }

  return (
    <VoucherLayout>
      <h2 className="mb-4 text-xl font-bold">خریدهای من</h2>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {error && <EmptyState title="خطا در بارگذاری خریدها" description={(error as Error).message} />}

      {!isLoading && !error && purchases.length === 0 && (
        <EmptyState title="واچری خریداری نشده" description="از فروشگاه واچر، پلتفرم مورد نظر را انتخاب کنید" />
      )}

      <div className="space-y-3">
        {purchases.map((purchase) => (
          <Card key={purchase.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={purchase.voucher.platform.logoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-contain"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{purchase.voucher.platform.name}</p>
                    <p className="text-sm text-muted-foreground">{formatDurationMonths(purchase.voucher.duration)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(purchase.createdAt)}</p>
                  </div>
                </div>
                <Badge variant={statusVariant(purchase.status)}>
                  {VOUCHER_PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
                </Badge>
              </div>

              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p>{formatPrice(purchase.amount)}</p>
                <p className="text-xs text-muted-foreground">انقضا: {formatVoucherExpiry(purchase.voucher.expiresAt)}</p>
              </div>

              {purchase.status === "PAID" && purchase.voucher.code && (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
                  <code dir="ltr" className="truncate text-sm font-medium">
                    {purchase.voucher.code}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copyCode(purchase.voucher.code!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {purchase.status === "PENDING_PAYMENT" && (
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={payMutation.isPending}
                  onClick={() => payMutation.mutate(purchase.id)}
                >
                  {payMutation.isPending ? "در حال انتقال..." : "پرداخت"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </VoucherLayout>
  );
}
