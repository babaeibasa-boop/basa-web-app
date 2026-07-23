import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/badge";
import { Package, Clock, CheckCircle, Users } from "lucide-react";

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => adminApi.getDashboard(),
  });

  const stats = data?.data;

  const cards = [
    { label: "کل سفارش‌ها", value: stats?.totalOrders, icon: Package },
    { label: "در انتظار پرداخت", value: stats?.pendingOrders, icon: Clock },
    { label: "تکمیل شده", value: stats?.completedOrders, icon: CheckCircle },
    { label: "کاربران", value: stats?.totalUsers, icon: Users },
  ];

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">داشبورد</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{card.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
