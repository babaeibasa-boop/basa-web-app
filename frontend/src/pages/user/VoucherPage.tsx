import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { voucherApi } from "@/api";
import { VoucherLayout } from "@/components/layout/layout";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function VoucherPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["voucher-platforms"],
    queryFn: () => voucherApi.getPlatforms(),
  });

  const platforms = data?.data ?? [];

  return (
    <VoucherLayout>
      <h2 className="mb-4 text-xl font-bold">پلتفرم‌ها</h2>
      <p className="mb-6 text-sm text-muted-foreground">واچر مورد نظر خود را از پلتفرم‌های زیر انتخاب کنید.</p>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {error && <EmptyState title="خطا در بارگذاری پلتفرم‌ها" description={(error as Error).message} />}

      {!isLoading && !error && platforms.length === 0 && (
        <EmptyState title="پلتفرمی وجود ندارد" description="به‌زودی واچرهای جدید اضافه می‌شوند" />
      )}

      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
        {platforms.map((platform) => (
          <Link
            key={platform.id}
            to={`/voucher/${platform.slug}`}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm",
              "transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10",
            )}
          >
            <span className="flex h-14 items-center justify-center">
              <img src={platform.logoUrl} alt="" className="max-h-12 max-w-full object-contain" />
            </span>
            <span className="truncate font-medium">{platform.name}</span>
          </Link>
        ))}
      </div>
    </VoucherLayout>
  );
}
