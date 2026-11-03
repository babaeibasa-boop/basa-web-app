import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/api";
import { Skeleton } from "@/components/ui/badge";
import {
  buildWalletLoginAttemptKey,
  shouldStartWalletLogin,
} from "@/lib/wallet-login-guard";
import {
  buildLoginHref,
  isCreditsPath,
  safeRedirectPath,
  voucherPlatformSlugFromPath,
} from "@/lib/utils";

const postLoginPath = import.meta.env.PROD ? "/reftek" : "/orders";

export default function SplashPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, logout, isAuthenticated } = useAuth();
  const walletAttempt = useRef<string | null>(null);

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
      navigate(buildLoginHref("/", searchParams), { replace: true });
      return;
    }

    const attempt = buildWalletLoginAttemptKey(ut, platformSlug, walletScope);
    if (!shouldStartWalletLogin(walletAttempt.current, attempt)) return;
    walletAttempt.current = attempt;

    authApi
      .walletLogin(ut, platformSlug, walletScope)
      .then((res) => {
        login(res.data.token, res.data.user);
        navigate(nextPath, { replace: true });
      })
      .catch(() => {
        logout();
        const loginSearch = new URLSearchParams();
        loginSearch.set("redirect", nextPath);
        navigate(`/login?${loginSearch.toString()}`, { replace: true });
      });
  }, [searchParams, login, logout, navigate, isAuthenticated]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">در حال بارگذاری</h1>
        <p className="mt-2 text-muted-foreground">در حال ورود...</p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
      </div>
    </div>
  );
}
