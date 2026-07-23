import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, EmptyState } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => adminApi.getUsers({ search: search || undefined, page }),
  });

  const users = data?.data?.users ?? [];
  const total = data?.data?.total ?? 0;
  const limit = data?.data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <h2 className="mb-4 text-xl font-bold">کاربران</h2>

      <Input
        placeholder="جستجو بر اساس نام یا شماره..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="mb-4 sm:max-w-xs"
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {!isLoading && users.length === 0 && <EmptyState title="کاربری یافت نشد" />}

      <div className="space-y-2">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{user.name} {user.family}</p>
                <p className="text-sm text-muted-foreground" dir="ltr">{user.phone}</p>
              </div>
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
