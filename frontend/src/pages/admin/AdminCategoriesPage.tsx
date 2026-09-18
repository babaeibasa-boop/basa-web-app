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
import type { Category } from "@/types";

const emptyForm = { name: "", slug: "", sortOrder: "0" };

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => adminApi.getCategories(),
  });

  const payload = {
    name: form.name,
    slug: form.slug,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
  };

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCategory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast("دسته‌بندی اضافه شد");
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const updateMutation = useMutation({
    mutationFn: () => adminApi.updateCategory(editing!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast("دسته‌بندی بروزرسانی شد");
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast("دسته‌بندی حذف شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const categories = data?.data ?? [];
  const isEditing = !!editing;
  const canSubmit = Boolean(form.name.trim() && form.slug.trim());

  function startEdit(category: Category) {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      sortOrder: String(category.sortOrder),
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm);
  }

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">دسته‌بندی‌ها</h2>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{isEditing ? "ویرایش دسته‌بندی" : "افزودن دسته‌بندی"}</CardTitle>
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
                placeholder="entertainment"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sortOrder">ترتیب نمایش</Label>
              <Input
                id="sortOrder"
                type="number"
                dir="ltr"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
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
      {!isLoading && categories.length === 0 && <EmptyState title="دسته‌بندی ثبت نشده" />}

      <div className="space-y-2">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{category.name}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">
                {category.slug} · {category.sortOrder}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" onClick={() => startEdit(category)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteId(category.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="حذف دسته‌بندی"
        description="آیا از حذف این دسته‌بندی اطمینان دارید؟"
        destructive
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </AdminLayout>
  );
}
