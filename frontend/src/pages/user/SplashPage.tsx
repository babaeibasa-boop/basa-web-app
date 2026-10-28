import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/api";
import { Skeleton } from "@/components/ui/badge";
import { isCreditsPath, safeRedirectPath, voucherPlatformSlugFromPath } from "@/lib/utils";

const postLoginPath = import.meta.env.PROD ? "/reftek" : "/orders";

export default function SplashPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [loginError, setLoginError] = useState(false);

  useEffect(() => {
    const ut = searchParams.get("ut");
    const nextPath = safeRedirectPath(searchParams.get("redirect"), postLoginPath);
    const platformSlug =
      searchParams.get("platform") || voucherPlatformSlugFromPath(nextPath) || undefined;
    const walletScope = isCreditsPath(nextPath) ? "credits" : undefined;

    if (isAuthenticated && !ut) {
      navigate(nextPath, { replace: true });
      return;
    }

    if (!ut) {
      const redirect = searchParams.get("redirect");
      const loginSearch = new URLSearchParams();
      if (redirect) loginSearch.set("redirect", redirect);
      const qs = loginSearch.toString();
      navigate(qs ? `/login?${qs}` : "/login", { replace: true });
      return;
    }

    setLoginError(false);
    authApi
      .walletLogin(ut, platformSlug, walletScope)
      .then((res) => {
        login(res.data.token, res.data.user);
        navigate(nextPath, { replace: true });
      })
      .catch(() => {
        setLoginError(true);
      });
  }, [searchParams, login, navigate, isAuthenticated]);

  const ut = searchParams.get("ut");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">در حال بارگذاری</h1>
        <p className="mt-2 text-muted-foreground">
          {loginError
            ? "ورود ناموفق بود. لطفاً مجددا از کیف پول باسا وارد شوید."
            : "در حال ورود..."}
        </p>
      </div>
      {!loginError && ut && (
        <div className="w-full max-w-xs space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mx-auto" />
        </div>
      )}
    </div>
  );
}
