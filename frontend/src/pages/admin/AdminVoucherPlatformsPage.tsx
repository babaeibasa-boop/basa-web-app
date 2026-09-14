import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import type { VoucherPlatform } from "@/types";

const emptyForm = { name: "", slug: "", logoUrl: "", apiKey: "" };

export default function AdminVoucherPlatformsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<VoucherPlatform | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-voucher-platforms"],
    queryFn: () => adminApi.getVoucherPlatforms(),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createVoucherPlatform(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-voucher-platforms"] });
      toast("پلتفرم اضافه شد");
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateVoucherPlatform(editing!.id, {
        name: form.name,
        slug: form.slug,
        logoUrl: form.logoUrl,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-voucher-platforms"] });
      toast("پلتفرم بروزرسانی شد");
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteVoucherPlatform(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-voucher-platforms"] });
      toast("پلتفرم حذف شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const platforms = data?.data ?? [];
  const isEditing = !!editing;
  const canSubmit = form.name && form.slug && form.logoUrl && (isEditing || form.apiKey);

  function startEdit(platform: VoucherPlatform) {
    setEditing(platform);
    setForm({
      name: platform.name,
      slug: platform.slug,
      logoUrl: platform.logoUrl,
      apiKey: "",
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm);
  }

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">پلتفرم‌های واچر</h2>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{isEditing ? "ویرایش پلتفرم" : "افزودن پلتفرم"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">نام</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="slug">شناسه مسیر</Label>
              <Input
                id="slug"
                dir="ltr"
                placeholder="spotify"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="logoUrl">آدرس لوگو</Label>
              <Input
                id="logoUrl"
                dir="ltr"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="apiKey">کلید درگاه (PWD)</Label>
              <Input
                id="apiKey"
                type="password"
                dir="ltr"
                placeholder={isEditing ? "برای حفظ کلید فعلی خالی بگذارید" : ""}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {isEditing ? "ذخیره" : "افزودن"}
            </Button>
            {isEditing && (
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                انصراف
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && platforms.length === 0 && <EmptyState title="پلتفرمی ثبت نشده" />}

      <div className="space-y-2">
        {platforms.map((platform) => (
          <div key={platform.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={platform.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />
              <div className="min-w-0">
                <p className="truncate font-medium">{platform.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  /voucher/{platform.slug}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" onClick={() => startEdit(platform)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteId(platform.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="حذف پلتفرم"
        description="آیا از حذف این پلتفرم اطمینان دارید؟"
        destructive
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </AdminLayout>
  );
}
