import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatPrice, parseDigitInput, VOUCHER_STATUS_LABELS } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "همه" },
  { value: "AVAILABLE", label: "موجود" },
  { value: "RESERVED", label: "رزرو شده" },
  { value: "SOLD", label: "فروخته شده" },
  { value: "CANCELLED", label: "لغو شده" },
];

function statusVariant(status: string) {
  switch (status) {
    case "AVAILABLE":
      return "success" as const;
    case "SOLD":
      return "default" as const;
    case "CANCELLED":
      return "destructive" as const;
    default:
      return "warning" as const;
  }
}

export default function AdminVouchersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    platformId: "",
    amount: "",
    duration: "",
    expiresAt: "",
    code: "",
  });

  const platformsQuery = useQuery({
    queryKey: ["admin-voucher-platforms"],
    queryFn: () => adminApi.getVoucherPlatforms(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-vouchers", search, status, platformId, page],
    queryFn: () =>
      adminApi.getVouchers({
        search: search || undefined,
        status: status || undefined,
        platformId: platformId || undefined,
        page,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createVoucher({
        platformId: form.platformId,
        amount: parseDigitInput(form.amount),
        duration: form.duration,
        expiresAt: new Date(form.expiresAt).toISOString(),
        code: form.code,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast("واچر اضافه شد");
      setForm({ platformId: form.platformId, amount: "", duration: "", expiresAt: "", code: "" });
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const platforms = platformsQuery.data?.data ?? [];
  const vouchers = data?.data?.vouchers ?? [];
  const total = data?.data?.total ?? 0;
  const limit = data?.data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);
  const canCreate = form.platformId && form.amount && form.duration && form.expiresAt && form.code;

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">موجودی واچر</h2>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">افزودن واچر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="platform">پلتفرم</Label>
              <select
                id="platform"
                value={form.platformId}
                onChange={(e) => setForm({ ...form, platformId: e.target.value })}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="">انتخاب پلتفرم</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="amount">مبلغ (ریال)</Label>
              <Input
                id="amount"
                dir="ltr"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="duration">مدت</Label>
              <Input
                id="duration"
                placeholder="۱ ماه"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="expiresAt">تاریخ انقضا</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="code">کد واچر</Label>
              <Input
                id="code"
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
          </div>
          <Button size="sm" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
            افزودن
          </Button>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="جستجو..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
        <select
          value={platformId}
          onChange={(e) => {
            setPlatformId(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="">همه پلتفرم‌ها</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!isLoading && vouchers.length === 0 && <EmptyState title="واچری یافت نشد" />}

      <div className="space-y-3">
        {vouchers.map((voucher) => (
          <Card key={voucher.id}>
            <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {voucher.platform.name} — {formatPrice(voucher.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {voucher.duration} — انقضا {formatDate(voucher.expiresAt)}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {voucher.code}
                </p>
              </div>
              <Badge variant={statusVariant(voucher.status)}>
                {VOUCHER_STATUS_LABELS[voucher.status] ?? voucher.status}
              </Badge>
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
