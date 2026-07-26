import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Activity,
  AppWindow,
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
import { ReftekLayout } from "@/components/layout/layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function isImageIcon(name: string) {
  return name.startsWith("/") || name.startsWith("http://") || name.startsWith("https://");
}

function AppIcon({ name }: { name: string }) {
  if (isImageIcon(name)) {
    return <img src={name} alt="" className="h-[40px] object-contain" />;
  }
  const Icon = ICON_MAP[name] ?? AppWindow;
  return <Icon className="h-8 w-8" />;
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
  const [welcomeOpen, setWelcomeOpen] = useState(true);

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
  const defaultOpen = useMemo(() => groups.map((g) => g.category), [groups]);

  return (
    <ReftekLayout>
      <AlertDialog.Root open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
              "rounded-xl border bg-card p-6 shadow-lg",
            )}
          >
            <AlertDialog.Title className="text-lg font-semibold">طرح رفاهی فرهنگی</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              این بخش در حال آماده سازی میباشد و پذیرندگان، پس از اطلاع رسانی عمومی قابل استفاده خواهند بود.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end">
              <AlertDialog.Action asChild>
                <Button onClick={() => setWelcomeOpen(false)}>متوجه شدم</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <section className="relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-bl from-primary/10 via-background to-secondary/40 p-5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
            <AppWindow className="h-3.5 w-3.5 text-primary" />
            RefTek
          </div>
          <h2 className="text-xl font-bold tracking-tight">طرح رفاهی فرهنگی</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            با انتخاب هر برنامه وارد سایت آن می‌شوید.
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
          defaultValue={defaultOpen}
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
                    {categoryApps.length.toLocaleString("fa-IR")} برنامه
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {categoryApps.map((app) => {
                    const busy = launchingId === app.appId;
                    return (
                      <button
                        key={app.appId}
                        type="button"
                        disabled={launchMutation.isPending}
                        onClick={() => launchMutation.mutate(app.appId)}
                        className={cn(
                          "group flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-all duration-200 ease-out",
                          "hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          "hover:bg-accent/40",
                          busy && "border-primary/40 bg-primary/5",
                        )}
                      >
                        <span className="flex h-14 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors group-hover:text-primary">
                          {busy ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            <AppIcon name={app.icon} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{app.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </ReftekLayout>
  );
}
