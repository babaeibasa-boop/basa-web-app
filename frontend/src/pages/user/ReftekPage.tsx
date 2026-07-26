import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AppWindow, ChevronLeft, FolderOpen, LayoutGrid, List, Search } from "lucide-react";
import { reftekApi } from "@/api";
import { ReftekLayout } from "@/components/layout/layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge, EmptyState, Skeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupByCategory, ReftekAppGrid } from "./reftek-shared";

type ReftekView = "apps" | "categories";

const WELCOME_SEEN_KEY = "reftek-welcome-seen";

function hasSeenWelcome() {
  try {
    return sessionStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    sessionStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function ReftekPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ReftekView = searchParams.get("view") === "apps" ? "apps" : "categories";
  const [query, setQuery] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());

  function dismissWelcome() {
    markWelcomeSeen();
    setWelcomeOpen(false);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["reftek-apps"],
    queryFn: () => reftekApi.getApps(),
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

  function setView(next: ReftekView) {
    if (next === "apps") {
      setSearchParams({ view: "apps" });
    } else {
      setSearchParams({});
    }
  }

  return (
    <ReftekLayout>
      <AlertDialog.Root
        open={welcomeOpen}
        onOpenChange={(open) => {
          if (!open) dismissWelcome();
          else setWelcomeOpen(true);
        }}
      >
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
                <Button onClick={dismissWelcome}>متوجه شدم</Button>
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

      <div className="mb-4 flex rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setView("categories")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
            view === "categories"
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <List className="h-4 w-4" />
          لیست
        </button>
        <button
          type="button"
          onClick={() => setView("apps")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
            view === "apps"
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          آکاردئون
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={view === "categories" ? "جستجوی دسته‌بندی..." : "جستجوی نام یا دسته‌بندی..."}
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

      {!isLoading && !error && groups.length > 0 && view === "apps" && (
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
                <ReftekAppGrid apps={categoryApps} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {!isLoading && !error && groups.length > 0 && view === "categories" && (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {groups.map(({ category, apps: categoryApps }) => (
            <Link
              key={category}
              to={`/reftek/category/${encodeURIComponent(category)}`}
              className={cn(
                "flex items-center gap-3 border-b px-4 py-3.5 transition-colors last:border-b-0",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FolderOpen className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{category}</span>
              <Badge variant="secondary" className="shrink-0">
                {categoryApps.length.toLocaleString("fa-IR")} برنامه
              </Badge>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </ReftekLayout>
  );
}
