import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AppWindow,
  ChevronLeft,
  Clock,
  FolderOpen,
  Headset,
  Loader2,
  Search,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { reftekApi } from "@/api";
import { UserLayout } from "@/components/layout/layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ReftekApp } from "@/types";

const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  Clock,
  Wallet,
  ShoppingCart,
  Headset,
  Activity,
  AppWindow,
  FolderOpen,
};

function AppIcon({ name }: { name: string }) {
  const Icon = ICON_MAP[name] ?? AppWindow;
  return <Icon className="h-5 w-5" />;
}

function groupByCategory(apps: ReftekApp[]) {
  const map = new Map<string, ReftekApp[]>();
  for (const app of apps) {
    const list = map.get(app.category) ?? [];
    list.push(app);
    map.set(app.category, list);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, apps: items }));
}

export default function ReftekPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reftek-apps"],
    queryFn: () => reftekApi.getApps(),
  });

  const launchMutation = useMutation({
    mutationFn: (appId: string) => reftekApi.launchApp(appId),
    onMutate: (appId) => setLaunchingId(appId),
    onSuccess: (response) => {
      const url = response.data?.url;
      if (!url) {
        toast("آدرس اپلیکیشن دریافت نشد", "destructive");
        return;
      }
      window.location.assign(url);
    },
    onError: (err) => {
      toast((err as Error).message || "خطا در باز کردن اپلیکیشن", "destructive");
    },
    onSettled: () => setLaunchingId(null),
  });

  const apps = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q) ||
        (app.description ?? "").toLowerCase().includes(q),
    );
  }, [apps, query]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const defaultOpen = groups[0]?.category;

  return (
    <UserLayout>
      <section className="relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-bl from-primary/10 via-background to-secondary/40 p-5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
            <AppWindow className="h-3.5 w-3.5 text-primary" />
            RefTek
          </div>
          <h2 className="text-xl font-bold tracking-tight">اپلیکیشن‌های وب</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            از دسته‌بندی‌ها یکی را باز کنید و با یک لمس وارد اپلیکیشن مورد نظر شوید.
          </p>
        </div>
      </section>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجوی نام یا دسته‌بندی..."
          className="pr-9"
          aria-label="جستجوی اپلیکیشن"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <EmptyState title="خطا در بارگذاری اپلیکیشن‌ها" description={(error as Error).message} />
      )}

      {!isLoading && !error && groups.length === 0 && (
        <EmptyState
          title="اپلیکیشنی یافت نشد"
          description={query ? "عبارت جستجو را تغییر دهید" : "هنوز اپلیکیشنی تعریف نشده است"}
        />
      )}

      {!isLoading && !error && groups.length > 0 && (
        <Accordion
          type="multiple"
          defaultValue={defaultOpen ? [defaultOpen] : []}
          className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          {groups.map(({ category, apps: categoryApps }) => (
            <AccordionItem key={category} value={category} className="px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <span className="truncate text-base font-semibold">{category}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {categoryApps.length.toLocaleString("fa-IR")} اپ
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {categoryApps.map((app) => {
                    const busy = launchingId === app.appId;
                    return (
                      <li key={app.appId}>
                        <button
                          type="button"
                          disabled={launchMutation.isPending}
                          onClick={() => launchMutation.mutate(app.appId)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border bg-background/60 p-3 text-right transition-all",
                            "hover:border-primary/30 hover:bg-accent/60 hover:shadow-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:opacity-60",
                            busy && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                            {busy ? (
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            ) : (
                              <AppIcon name={app.icon} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{app.name}</span>
                            {app.description && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {app.description}
                              </span>
                            )}
                          </span>
                          <ChevronLeft
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              "group-hover:-translate-x-0.5 group-hover:text-primary",
                            )}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </UserLayout>
  );
}
