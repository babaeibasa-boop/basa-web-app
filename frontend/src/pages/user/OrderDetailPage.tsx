import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { orderApi, paymentApi } from "@/api";
import { UserLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Skeleton, EmptyState } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AI_MODEL_LABELS,
  ORDER_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  formatDate,
  formatPrice,
} from "@/lib/utils";

function invoiceVariant(status: string) {
  switch (status) {
    case "PAID":
      return "success" as const;
    case "REFUNDED":
      return "secondary" as const;
    case "CANCELLED":
      return "destructive" as const;
    default:
      return "warning" as const;
  }
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderApi.getOrder(id!),
    enabled: !!id,
  });

  const payMutation = useMutation({
    mutationFn: (invoiceId: string) => paymentApi.payInvoice(invoiceId),
    onSuccess: (res) => {
      window.location.href = res.data.payUrl;
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const order = data?.data;

  if (isLoading) {
    return (
      <UserLayout>
        <Skeleton className="h-48 w-full" />
      </UserLayout>
    );
  }

  if (error || !order) {
    return (
      <UserLayout>
        <EmptyState title="سفارش یافت نشد" />
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/orders")}>
        بازگشت
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{AI_MODEL_LABELS[order.aiModel]}</CardTitle>
            <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">پلن:</span> {order.selectedPlan}
            </div>
            <div>
              <span className="text-muted-foreground">تاریخ:</span> {formatDate(order.createdAt)}
            </div>
          </div>
        </CardContent>
      </Card>

      <h3 className="mb-3 mt-6 text-lg font-semibold">فاکتورها</h3>

      {order.invoices.length === 0 ? (
        <EmptyState title="فاکتوری وجود ندارد" />
      ) : (
        <div className="space-y-3">
          {order.invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{formatPrice(invoice.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(invoice.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={invoiceVariant(invoice.status)}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                  {invoice.status === "PENDING" && (
                    <Button
                      size="sm"
                      disabled={payMutation.isPending}
                      onClick={() => setPayInvoiceId(invoice.id)}
                    >
                      {payMutation.isPending ? "در حال انتقال..." : "پرداخت"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!payInvoiceId}
        onOpenChange={(open) => !open && setPayInvoiceId(null)}
        title="تأیید پرداخت"
        description="آیا از پرداخت این فاکتور اطمینان دارید؟"
        onConfirm={() => {
          if (payInvoiceId) payMutation.mutate(payInvoiceId);
          setPayInvoiceId(null);
        }}
        confirmText="پرداخت"
      />
    </UserLayout>
  );
}
