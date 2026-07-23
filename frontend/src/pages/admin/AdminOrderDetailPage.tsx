import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AI_MODEL_LABELS,
  ORDER_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  formatDate,
  formatPrice,
  formatAmountInput,
  parseDigitInput,
} from "@/lib/utils";

const CREDENTIAL_LABELS: Record<string, string> = {
  email: "ایمیل",
  password: "رمز عبور",
  username: "نام کاربری",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newAmount, setNewAmount] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ status: string; label: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => adminApi.getOrder(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => adminApi.updateOrderStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
      toast("وضعیت بروزرسانی شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const amountMutation = useMutation({
    mutationFn: (amount: string) => adminApi.updateOrderAmount(id!, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
      toast("مبلغ بروزرسانی شد");
      setNewAmount("");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const order = data?.data;

  if (isLoading) {
    return (
      <AdminLayout>
        <Skeleton className="h-48 w-full" />
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout>
        <p>سفارش یافت نشد</p>
      </AdminLayout>
    );
  }

  const totalAmount = order.invoices
    .filter((inv) => inv.status === "PENDING" || inv.status === "PAID")
    .reduce((sum, inv) => sum + BigInt(inv.amount), BigInt(0));
  const isLocked = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canChangeStatus = order.status === "PAID";
  const canEditAmount = order.status === "PENDING_PAYMENT" || order.status === "PAID";

  return (
    <AdminLayout>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/admin/orders")}>
        بازگشت
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{AI_MODEL_LABELS[order.aiModel]}</CardTitle>
            <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">پلن:</span> {order.selectedPlan}</p>
          <p><span className="text-muted-foreground">کاربر:</span> {order.user?.name} {order.user?.family} — {order.user?.phone}</p>
          <p><span className="text-muted-foreground">تاریخ:</span> {formatDate(order.createdAt)}</p>
          <p><span className="text-muted-foreground">مجموع:</span> {formatPrice(totalAmount.toString())}</p>
        </CardContent>
      </Card>

      {order.credentials && Object.keys(order.credentials).length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">اطلاعات حساب کاربر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(order.credentials).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{CREDENTIAL_LABELS[key] ?? key}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-left" dir="ltr">
                    {key === "password" && !showPassword ? "••••••••" : value}
                  </span>
                  {key === "password" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <h3 className="mb-3 mt-6 text-lg font-semibold">فاکتورها</h3>
      <div className="space-y-2">
        {order.invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="flex items-center justify-between p-3 text-sm">
              <span>{formatPrice(inv.amount)}</span>
              <Badge>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLocked && canChangeStatus && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">تغییر وضعیت</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setConfirmAction({ status: "COMPLETED", label: "تکمیل" })}>
              تکمیل سفارش
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ status: "CANCELLED", label: "لغو" })}>
              لغو سفارش
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLocked && canEditAmount && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">ویرایش مبلغ</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="amount">مبلغ جدید (ریال)</Label>
              <Input
                id="amount"
                dir="ltr"
                inputMode="numeric"
                value={formatAmountInput(newAmount)}
                onChange={(e) => setNewAmount(parseDigitInput(e.target.value))}
              />
            </div>
            <Button
              className="mt-6"
              size="sm"
              disabled={!newAmount}
              onClick={() => amountMutation.mutate(newAmount)}
            >
              بروزرسانی
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`${confirmAction?.label} سفارش`}
        description={`آیا از ${confirmAction?.label} این سفارش اطمینان دارید؟`}
        destructive={confirmAction?.status === "CANCELLED"}
        onConfirm={() => {
          if (confirmAction) statusMutation.mutate(confirmAction.status);
          setConfirmAction(null);
        }}
      />
    </AdminLayout>
  );
}
