import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/api";
import { Skeleton } from "@/components/ui/badge";

export default function SplashPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    const ut = searchParams.get("ut");

    if (isAuthenticated && !ut) {
      navigate("/orders", { replace: true });
      return;
    }

    if (!ut) {
      navigate("/orders", { replace: true });
      return;
    }

    authApi
      .walletLogin(ut)
      .then((res) => {
        login(res.data.token, res.data.user);
        navigate("/orders", { replace: true });
      })
      .catch(() => {
        navigate("/orders", { replace: true });
      });
  }, [searchParams, login, navigate, isAuthenticated]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">فروشگاه اشتراک AI</h1>
        <p className="mt-2 text-muted-foreground">در حال ورود...</p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
      </div>
    </div>
  );
}
