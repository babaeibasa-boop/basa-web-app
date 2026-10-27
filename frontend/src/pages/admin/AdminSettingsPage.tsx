import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, EmptyState } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [developerPhone, setDeveloperPhone] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDeveloperId, setDeleteDeveloperId] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.getSettings(),
  });

  const settingsMutation = useMutation({
    mutationFn: (hideVouchersExpiringSoon: boolean) => adminApi.updateSettings({ hideVouchersExpiringSoon }),
    onSuccess: (res) => {
      queryClient.setQueryData(["admin-settings"], res);
      toast("تنظیمات ووچر ذخیره شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-phones"],
    queryFn: () => adminApi.getPhones(),
  });

  const addMutation = useMutation({
    mutationFn: (phone: string) => adminApi.addPhone(phone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-phones"] });
      toast("شماره اضافه شد");
      setPhone("");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePhone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-phones"] });
      toast("شماره حذف شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const developerPhonesQuery = useQuery({
    queryKey: ["admin-developer-phones"],
    queryFn: () => adminApi.getDeveloperPhones(),
  });

  const addDeveloperMutation = useMutation({
    mutationFn: (value: string) => adminApi.addDeveloperPhone(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-developer-phones"] });
      toast("شماره توسعه‌دهنده اضافه شد");
      setDeveloperPhone("");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const deleteDeveloperMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteDeveloperPhone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-developer-phones"] });
      toast("شماره توسعه‌دهنده حذف شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const phones = data?.data ?? [];
  const developerPhones = developerPhonesQuery.data?.data ?? [];

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">تنظیمات</h2>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">تنظیمات ووچر</CardTitle>
        </CardHeader>
        <CardContent>
          {settingsQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={settingsQuery.data?.data.hideVouchersExpiringSoon ?? true}
                disabled={settingsMutation.isPending}
                onChange={(event) => settingsMutation.mutate(event.target.checked)}
              />
              <span>
                <span className="font-medium">مخفی کردن ووچرهای نزدیک به انقضا</span>
                <span className="mt-1 block text-muted-foreground">
                  اگر فعال باشد، ووچرهایی که کمتر از دو روز تا انقضایشان مانده برای کاربران نمایش داده نمی‌شوند. ووچرهای بدون تاریخ انقضا همیشه نمایش داده می‌شوند.
                </span>
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">شماره‌های توسعه‌دهنده</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            این شماره‌ها می‌توانند پلتفرم‌های اعتبار غیرفعال را در فهرست خود ببینند و باز کنند، به رف‌تک دسترسی داشته باشند و موجودی اعتبار آزمایشی دریافت کنند.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="developer-phone">شماره موبایل</Label>
              <Input
                id="developer-phone"
                dir="ltr"
                value={developerPhone}
                onChange={(e) => setDeveloperPhone(e.target.value)}
              />
            </div>
            <Button
              className="mt-6"
              size="sm"
              disabled={!developerPhone || addDeveloperMutation.isPending}
              onClick={() => addDeveloperMutation.mutate(developerPhone)}
            >
              افزودن
            </Button>
          </div>

          {developerPhonesQuery.isLoading && <Skeleton className="h-12 w-full" />}

          {!developerPhonesQuery.isLoading && developerPhones.length === 0 && (
            <EmptyState title="شماره‌ای ثبت نشده" />
          )}

          <div className="space-y-2">
            {developerPhones.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                <span dir="ltr">{entry.phone}</span>
                <Button variant="ghost" size="icon" onClick={() => setDeleteDeveloperId(entry.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">شماره‌های اعلان SMS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="phone">شماره موبایل</Label>
              <Input id="phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button className="mt-6" size="sm" disabled={!phone} onClick={() => addMutation.mutate(phone)}>
              افزودن
            </Button>
          </div>

          {isLoading && <Skeleton className="h-12 w-full" />}

          {!isLoading && phones.length === 0 && (
            <EmptyState title="شماره‌ای ثبت نشده" />
          )}

          <div className="space-y-2">
            {phones.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                <span dir="ltr">{p.phone}</span>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="حذف شماره"
        description="آیا از حذف این شماره اطمینان دارید؟"
        destructive
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteDeveloperId}
        onOpenChange={(open) => !open && setDeleteDeveloperId(null)}
        title="حذف شماره توسعه‌دهنده"
        description="آیا از حذف این شماره اطمینان دارید؟"
        destructive
        onConfirm={() => {
          if (deleteDeveloperId) deleteDeveloperMutation.mutate(deleteDeveloperId);
          setDeleteDeveloperId(null);
        }}
      />
    </AdminLayout>
  );
}
