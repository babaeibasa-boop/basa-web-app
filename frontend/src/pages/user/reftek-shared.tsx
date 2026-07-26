import { useState } from "react";
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

export function AppIcon({ name }: { name: string }) {
  if (isImageIcon(name)) {
    return <img src={name} alt="" className="h-[40px] object-contain" />;
  }
  const Icon = ICON_MAP[name] ?? AppWindow;
  return <Icon className="h-8 w-8" />;
}

export function groupByCategory(apps: ReftekApp[]) {
  const map = new Map<string, ReftekApp[]>();
  for (const app of apps) {
    const list = map.get(app.category) ?? [];
    list.push(app);
    map.set(app.category, list);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, apps: items }));
}

export function ReftekAppGrid({ apps }: { apps: ReftekApp[] }) {
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
      {apps.map((app) => {
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
  );
}
