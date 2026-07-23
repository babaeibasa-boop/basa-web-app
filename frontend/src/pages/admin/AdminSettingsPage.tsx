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
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const phones = data?.data ?? [];

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">تنظیمات</h2>

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
    </AdminLayout>
  );
}
