import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Skeleton, EmptyState } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AI_MODEL_LABELS, ORDER_STATUS_LABELS, formatDate } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "همه" },
  { value: "PENDING_PAYMENT", label: "در انتظار پرداخت" },
  { value: "PAID", label: "پرداخت شده" },
  { value: "COMPLETED", label: "تکمیل شده" },
  { value: "CANCELLED", label: "لغو شده" },
];

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", search, status, page],
    queryFn: () => adminApi.getOrders({ search: search || undefined, status: status || undefined, page }),
  });

  const orders = data?.data?.orders ?? [];
  const total = data?.data?.total ?? 0;
  const limit = data?.data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <h2 className="mb-4 text-xl font-bold">سفارش‌ها</h2>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="جستجو..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="sm:max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {!isLoading && orders.length === 0 && <EmptyState title="سفارشی یافت نشد" />}

      <div className="space-y-3">
        {orders.map((order) => (
          <Link key={order.id} to={`/admin/orders/${order.id}`}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">
                    {AI_MODEL_LABELS[order.aiModel]} — {order.selectedPlan}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.user?.name} {order.user?.family} — {order.user?.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            قبلی
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            {page} از {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            بعدی
          </Button>
        </div>
      )}
    </AdminLayout>
  );
}
