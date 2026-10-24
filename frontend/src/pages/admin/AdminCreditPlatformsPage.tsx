import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { adminApi } from "@/api";
import { AdminLayout } from "@/components/layout/layout";
import { MarkdownContent } from "@/components/credits/markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import type { AdminCreditPlatform, CreditFeatureMode } from "@/types";

const FEATURE_MODES: CreditFeatureMode[] = ["API", "REDIRECT", "DISABLED"];

const MODE_LABELS: Record<CreditFeatureMode, string> = {
  API: "از طریق API",
  REDIRECT: "هدایت به پلتفرم",
  DISABLED: "غیرفعال",
};

const emptyForm = {
  name: "",
  slug: "",
  logoUrl: "",
  adapterKey: "mock",
  configText: "{}",
  installmentsMode: "DISABLED" as CreditFeatureMode,
  installmentsUrl: "",
  merchantsMode: "DISABLED" as CreditFeatureMode,
  merchantsUrl: "",
  launchUrl: "",
  instructions: "",
  isActive: true,
  sortOrder: "0",
};

export default function AdminCreditPlatformsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<AdminCreditPlatform | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const platformsQuery = useQuery({
    queryKey: ["admin-credit-platforms"],
    queryFn: () => adminApi.getCreditPlatforms(),
  });

  const adaptersQuery = useQuery({
    queryKey: ["admin-credit-adapters"],
    queryFn: () => adminApi.getCreditAdapters(),
  });

  const adapters = adaptersQuery.data?.data ?? [];
  const selectedAdapter = adapters.find((adapter) => adapter.key === form.adapterKey);

  const createMutation = useMutation({
    mutationFn: () => {
      const config = parseConfig(form.configText);
      return adminApi.createCreditPlatform({
        name: form.name,
        slug: form.slug,
        logoUrl: form.logoUrl,
        adapterKey: form.adapterKey,
        config,
        installmentsMode: form.installmentsMode,
        installmentsUrl: form.installmentsUrl || null,
        merchantsMode: form.merchantsMode,
        merchantsUrl: form.merchantsUrl || null,
        launchUrl: form.launchUrl || null,
        instructions: form.instructions,
        isActive: form.isActive,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credit-platforms"] });
      toast("پلتفرم اعتبار اضافه شد");
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof adminApi.updateCreditPlatform>[1] = {
        name: form.name,
        slug: form.slug,
        logoUrl: form.logoUrl,
        adapterKey: form.adapterKey,
        installmentsMode: form.installmentsMode,
        installmentsUrl: form.installmentsUrl || null,
        merchantsMode: form.merchantsMode,
        merchantsUrl: form.merchantsUrl || null,
        launchUrl: form.launchUrl || null,
        instructions: form.instructions,
        isActive: form.isActive,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
      };
      const trimmed = form.configText.trim();
      if (trimmed && trimmed !== "{}") {
        payload.config = parseConfig(trimmed);
      } else if (editing && form.adapterKey !== editing.adapterKey) {
        payload.config = parseConfig(trimmed || "{}");
      }
      return adminApi.updateCreditPlatform(editing!.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credit-platforms"] });
      toast("پلتفرم اعتبار بروزرسانی شد");
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCreditPlatform(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credit-platforms"] });
      toast("پلتفرم اعتبار حذف شد");
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const platforms = platformsQuery.data?.data ?? [];
  const isEditing = !!editing;

  const canSubmit = useMemo(() => {
    if (!form.name || !form.slug || !form.logoUrl || !form.adapterKey) return false;
    if (form.installmentsMode === "REDIRECT" && !form.installmentsUrl) return false;
    if (form.merchantsMode === "REDIRECT" && !form.merchantsUrl) return false;
    if (form.installmentsMode === "API" && selectedAdapter && !selectedAdapter.capabilities.installments) {
      return false;
    }
    if (form.merchantsMode === "API" && selectedAdapter && !selectedAdapter.capabilities.merchants) {
      return false;
    }
    if (!isEditing && !form.configText.trim()) return false;
    return true;
  }, [form, isEditing, selectedAdapter]);

  function startEdit(platform: AdminCreditPlatform) {
    setEditing(platform);
    setForm({
      name: platform.name,
      slug: platform.slug,
      logoUrl: platform.logoUrl,
      adapterKey: platform.adapterKey,
      configText: "",
      installmentsMode: platform.installmentsMode,
      installmentsUrl: platform.installmentsUrl ?? "",
      merchantsMode: platform.merchantsMode,
      merchantsUrl: platform.merchantsUrl ?? "",
      launchUrl: platform.launchUrl ?? "",
      instructions: platform.instructions,
      isActive: platform.isActive,
      sortOrder: String(platform.sortOrder),
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm);
  }

  return (
    <AdminLayout>
      <h2 className="mb-6 text-xl font-bold">پلتفرم‌های اعتبار</h2>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{isEditing ? "ویرایش پلتفرم" : "افزودن پلتفرم"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="credit-name">نام</Label>
              <Input
                id="credit-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="credit-slug">شناسه مسیر</Label>
              <Input
                id="credit-slug"
                dir="ltr"
                placeholder="snappay"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="credit-logo">آدرس لوگو</Label>
              <Input
                id="credit-logo"
                dir="ltr"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="credit-adapter">آداپتر</Label>
              <select
                id="credit-adapter"
                value={form.adapterKey}
                onChange={(e) => setForm({ ...form, adapterKey: e.target.value })}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {adapters.map((adapter) => (
                  <option key={adapter.key} value={adapter.key}>
                    {adapter.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="credit-sort">ترتیب</Label>
              <Input
                id="credit-sort"
                dir="ltr"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="credit-config">
                پیکربندی JSON {isEditing ? "(برای حفظ فعلی خالی بگذارید)" : ""}
              </Label>
              <textarea
                id="credit-config"
                dir="ltr"
                rows={4}
                value={form.configText}
                onChange={(e) => setForm({ ...form, configText: e.target.value })}
                placeholder='{"apiKey":"...","baseUrl":"..."}'
                className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                مقادیر محرمانه فقط هنگام ذخیره ارسال می‌شوند و در لیست نمایش داده نمی‌شوند.
              </p>
            </div>
            <div>
              <Label htmlFor="credit-installments-mode">اقساط</Label>
              <select
                id="credit-installments-mode"
                value={form.installmentsMode}
                onChange={(e) =>
                  setForm({ ...form, installmentsMode: e.target.value as CreditFeatureMode })
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {FEATURE_MODES.map((mode) => (
                  <option
                    key={mode}
                    value={mode}
                    disabled={mode === "API" && selectedAdapter && !selectedAdapter.capabilities.installments}
                  >
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="credit-installments-url">آدرس اقساط (هدایت)</Label>
              <Input
                id="credit-installments-url"
                dir="ltr"
                value={form.installmentsUrl}
                onChange={(e) => setForm({ ...form, installmentsUrl: e.target.value })}
                disabled={form.installmentsMode !== "REDIRECT"}
              />
            </div>
            <div>
              <Label htmlFor="credit-merchants-mode">پذیرندگان</Label>
              <select
                id="credit-merchants-mode"
                value={form.merchantsMode}
                onChange={(e) =>
                  setForm({ ...form, merchantsMode: e.target.value as CreditFeatureMode })
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {FEATURE_MODES.map((mode) => (
                  <option
                    key={mode}
                    value={mode}
                    disabled={mode === "API" && selectedAdapter && !selectedAdapter.capabilities.merchants}
                  >
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="credit-merchants-url">آدرس پذیرندگان (هدایت)</Label>
              <Input
                id="credit-merchants-url"
                dir="ltr"
                value={form.merchantsUrl}
                onChange={(e) => setForm({ ...form, merchantsUrl: e.target.value })}
                disabled={form.merchantsMode !== "REDIRECT"}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="credit-launch-url">آدرس استفاده از اعتبار (اختیاری)</Label>
              <Input
                id="credit-launch-url"
                dir="ltr"
                value={form.launchUrl}
                onChange={(e) => setForm({ ...form, launchUrl: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="credit-instructions">راهنمای استفاده (Markdown)</Label>
              <textarea
                id="credit-instructions"
                rows={5}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              {form.instructions.trim() && (
                <div className="mt-2 rounded-lg border p-3">
                  <p className="mb-2 text-xs text-muted-foreground">پیش‌نمایش</p>
                  <MarkdownContent content={form.instructions} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="credit-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <Label htmlFor="credit-active">فعال</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                try {
                  if (isEditing) updateMutation.mutate();
                  else createMutation.mutate();
                } catch (err) {
                  toast(err instanceof Error ? err.message : "پیکربندی نامعتبر است", "destructive");
                }
              }}
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

      {platformsQuery.isLoading && <Skeleton className="h-16 w-full" />}
      {!platformsQuery.isLoading && platforms.length === 0 && (
        <EmptyState title="پلتفرمی ثبت نشده" />
      )}

      <div className="space-y-2">
        {platforms.map((platform) => (
          <div key={platform.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={platform.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {platform.name}
                  {!platform.isActive && (
                    <Badge variant="warning" className="mr-2">
                      غیرفعال
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span dir="ltr">/credits/{platform.slug}</span>
                  <span className="mx-1">·</span>
                  {platform.adapterKey}
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
        title="حذف پلتفرم اعتبار"
        description="آیا از حذف این پلتفرم اطمینان دارید؟"
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
        confirmText="حذف"
      />
    </AdminLayout>
  );
}

function parseConfig(text: string): unknown {
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("پیکربندی JSON نامعتبر است");
  }
}
