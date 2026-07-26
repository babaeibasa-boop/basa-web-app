import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderOpen, Search } from "lucide-react";
import { reftekApi } from "@/api";
import { ReftekLayout } from "@/components/layout/layout";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReftekAppGrid } from "./reftek-shared";

export default function ReftekCategoryPage() {
  const navigate = useNavigate();
  const { category: categoryParam } = useParams<{ category: string }>();
  const category = categoryParam ? decodeURIComponent(categoryParam) : "";
  const [query, setQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["reftek-apps"],
    queryFn: () => reftekApi.getApps(),
  });

  const apps = useMemo(() => {
    const all = data?.data ?? [];
    return all.filter((app) => app.category === category);
  }, [data?.data, category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        (app.description ?? "").toLowerCase().includes(q),
    );
  }, [apps, query]);

  return (
    <ReftekLayout>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 gap-1.5"
        onClick={() => navigate("/reftek")}
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به دسته‌بندی‌ها
      </Button>

      <section className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FolderOpen className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight">{category || "دسته‌بندی"}</h2>
          <p className="text-sm text-muted-foreground">
            {apps.length > 0
              ? `${apps.length.toLocaleString("fa-IR")} برنامه در این دسته`
              : "برنامه‌های این دسته"}
          </p>
        </div>
      </section>

      {!isLoading && !error && apps.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی برنامه..."
            className="pr-9"
            aria-label="جستجوی برنامه"
          />
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <EmptyState title="خطا در بارگذاری اپلیکیشن‌ها" description={(error as Error).message} />
      )}

      {!isLoading && !error && apps.length === 0 && (
        <EmptyState
          title="اپلیکیشنی در این دسته نیست"
          description="این دسته‌بندی وجود ندارد یا برنامه‌ای برای آن تعریف نشده است"
          action={
            <Link to="/reftek" className="text-sm text-primary underline-offset-4 hover:underline">
              بازگشت به لیست دسته‌بندی‌ها
            </Link>
          }
        />
      )}

      {!isLoading && !error && apps.length > 0 && filtered.length === 0 && (
        <EmptyState title="اپلیکیشنی یافت نشد" description="عبارت جستجو را تغییر دهید" />
      )}

      {!isLoading && !error && filtered.length > 0 && <ReftekAppGrid apps={filtered} />}
    </ReftekLayout>
  );
}
