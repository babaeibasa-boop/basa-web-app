import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { voucherApi } from "@/api";
import { VoucherLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatPrice } from "@/lib/utils";
import type { VoucherOffer } from "@/types";

export default function VoucherPlatformPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<VoucherOffer | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["voucher-platform", slug],
    queryFn: () => voucherApi.getPlatform(slug!),
    enabled: !!slug,
  });

  const buyMutation = useMutation({
    mutationFn: async (offer: VoucherOffer) => {
      const purchase = await voucherApi.createPurchase({
        platformSlug: slug!,
        amount: offer.amount,
        duration: offer.duration,
        expiresAt: offer.expiresAt,
      });
      return voucherApi.payPurchase(purchase.data.id);
    },
    onSuccess: (res) => {
      window.location.href = res.data.payUrl;
    },
    onError: (err: Error) => {
      toast(err.message, "destructive");
      queryClient.invalidateQueries({ queryKey: ["voucher-platform", slug] });
    },
  });

  const platform = data?.data?.platform;
  const offers = data?.data?.offers ?? [];

  if (isLoading) {
    return (
      <VoucherLayout>
        <Skeleton className="h-10 w-40" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </VoucherLayout>
    );
  }

  if (error || !platform) {
    return (
      <VoucherLayout>
        <EmptyState title="پلتفرم یافت نشد" />
      </VoucherLayout>
    );
  }

  return (
    <VoucherLayout>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/voucher")}>
        بازگشت
      </Button>

      <div className="mb-6 flex items-center gap-3">
        <img src={platform.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
        <div>
          <h2 className="text-xl font-bold">{platform.name}</h2>
          <p className="text-sm text-muted-foreground">واچرهای موجود را انتخاب کنید</p>
        </div>
      </div>

      {offers.length === 0 && (
        <EmptyState title="واچری موجود نیست" description="در حال حاضر موجودی این پلتفرم به پایان رسیده است" />
      )}

      <div className="space-y-3">
        {offers.map((offer) => (
          <Card key={`${offer.amount}-${offer.duration}-${offer.expiresAt}`}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{formatPrice(offer.amount)}</p>
                <p className="text-sm text-muted-foreground">مدت: {offer.duration}</p>
                <p className="text-xs text-muted-foreground">انقضا: {formatDate(offer.expiresAt)}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <Badge variant="secondary">{offer.availableCount.toLocaleString("fa-IR")} عدد</Badge>
                <Button
                  size="sm"
                  disabled={buyMutation.isPending}
                  onClick={() => setSelected(offer)}
                >
                  خرید
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title="تأیید خرید واچر"
        description={
          selected
            ? `آیا از پرداخت ${formatPrice(selected.amount)} برای واچر ${platform.name} اطمینان دارید؟`
            : ""
        }
        onConfirm={() => {
          if (selected) buyMutation.mutate(selected);
          setSelected(null);
        }}
        confirmText={buyMutation.isPending ? "در حال انتقال..." : "پرداخت"}
      />
    </VoucherLayout>
  );
}
