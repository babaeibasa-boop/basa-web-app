import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatDurationMonths, formatPrice, formatVoucherExpiry } from "@/lib/utils";

export default function AdminVoucherSalesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-voucher-sales", search, page],
    queryFn: () => adminApi.getVoucherSales({ search: search || undefined, page }),
  });

  const sales = data?.data?.sales ?? [];
  const total = data?.data?.total ?? 0;
  const limit = data?.data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <h2 className="mb-4 text-xl font-bold">ووچرهای فروخته‌شده</h2>

      <div className="mb-4">
        <Input
          placeholder="جستجوی نام، شماره یا پلتفرم..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && sales.length === 0 && <EmptyState title="فروشی یافت نشد" />}

      <div className="space-y-3">
        {sales.map((sale) => (
          <Card key={sale.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">
                  {sale.voucher.platform.name} — {formatPrice(sale.amount)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(sale.createdAt)}</p>
              </div>
              <p className="text-sm">
                {sale.user.name} {sale.user.family}
                <span className="ms-2 text-muted-foreground" dir="ltr">
                  {sale.user.phone}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                مدت: {formatDurationMonths(sale.voucher.duration)} — انقضا: {formatVoucherExpiry(sale.voucher.expiresAt)}
              </p>
              <p className="truncate text-xs" dir="ltr">
                کد: {sale.voucher.code}
              </p>
            </CardContent>
          </Card>
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
