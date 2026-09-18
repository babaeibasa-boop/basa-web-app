import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Activity,
  AppWindow,
  Clock,
  FolderOpen,
  Headset,
  Loader2,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { reftekApi } from "@/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ReftekCatalogItem } from "@/types";

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

export function AppIcon({ name }: { name: string }) {
  if (isImageIcon(name)) {
    return <img src={name} alt="" className="h-[40px] object-contain" />;
  }
  const Icon = ICON_MAP[name] ?? AppWindow;
  return <Icon className="h-8 w-8" />;
}

export function groupByCategory(apps: ReftekCatalogItem[]) {
  const map = new Map<string, { categorySlug: string; categoryName: string; apps: ReftekCatalogItem[] }>();
  for (const app of apps) {
    const existing = map.get(app.categorySlug);
    if (existing) {
      existing.apps.push(app);
    } else {
      map.set(app.categorySlug, {
        categorySlug: app.categorySlug,
        categoryName: app.categoryName,
        apps: [app],
      });
    }
  }
  return Array.from(map.values());
}

export function ReftekAppGrid({ apps }: { apps: ReftekCatalogItem[] }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [launchingId, setLaunchingId] = useState<string | null>(null);

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

  function openItem(app: ReftekCatalogItem) {
    if (app.kind === "voucher" && app.platformSlug) {
      navigate(`/voucher/${app.platformSlug}`);
      return;
    }
    launchMutation.mutate(app.id);
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
      {apps.map((app) => {
        const busy = launchingId === app.id;
        return (
          <button
            key={`${app.kind}-${app.id}`}
            type="button"
            disabled={launchMutation.isPending}
            onClick={() => openItem(app)}
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
  );
}
