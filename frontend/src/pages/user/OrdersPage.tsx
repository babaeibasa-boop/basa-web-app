import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { orderApi } from "@/api";
import { UserLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Skeleton, EmptyState } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AI_MODEL_LABELS, ORDER_STATUS_LABELS, formatDate } from "@/lib/utils";

function statusVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "success" as const;
    case "PAID":
      return "default" as const;
    case "CANCELLED":
      return "destructive" as const;
    default:
      return "warning" as const;
  }
}

export default function OrdersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["orders"],
    queryFn: () => orderApi.getOrders(),
  });

  const orders = data?.data ?? [];

  return (
    <UserLayout>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">سفارش‌های من</h2>
        <Link to="/orders/new">
          <Button size="sm">سفارش جدید</Button>
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {error && (
        <EmptyState title="خطا در بارگذاری سفارش‌ها" description={(error as Error).message} />
      )}

      {!isLoading && !error && orders.length === 0 && (
        <EmptyState
          title="سفارشی وجود ندارد"
          description="اولین اشتراک خود را خریداری کنید"
          action={
            <Link to="/orders/new">
              <Button>خرید اشتراک</Button>
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <Link key={order.id} to={`/orders/${order.id}`} className="block">
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{AI_MODEL_LABELS[order.aiModel]}</p>
                  <p className="text-sm text-muted-foreground">{order.selectedPlan}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <Badge variant={statusVariant(order.status)}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </UserLayout>
  );
}
