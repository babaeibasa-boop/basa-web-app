import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { creditApi } from "@/api";
import { CreditsLayout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { formatDate, formatPrice } from "@/lib/utils";

export default function CreditsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["credit-platforms"],
    queryFn: () => creditApi.getPlatforms(),
  });

  const platforms = data?.data ?? [];

  return (
    <CreditsLayout>
      <h2 className="mb-2 text-xl font-bold">اعتبار من</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        موجودی اعتبار شما در پلتفرم‌های متصل به کیف پول
      </p>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && <EmptyState title="خطا در دریافت پلتفرم‌ها" description={error.message} />}

      {!isLoading && !error && platforms.length === 0 && (
        <EmptyState title="پلتفرمی ثبت نشده" description="هنوز پلتفرم اعتباری فعالی وجود ندارد" />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {platforms.map((platform) => (
          <Link key={platform.id} to={`/credits/${encodeURIComponent(platform.slug)}`}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center gap-3 p-4">
                <img
                  src={platform.logoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{platform.name}</p>
                  {platform.balance ? (
                    <>
                      <p className="text-lg font-bold text-primary">
                        {formatPrice(platform.balance.available)}
                      </p>
                      {platform.balance.expiresAt && (
                        <p className="text-xs text-muted-foreground">
                          انقضا: {formatDate(platform.balance.expiresAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-destructive">
                      {platform.error ?? "موجودی در دسترس نیست"}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </CreditsLayout>
  );
}
