import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle, XCircle } from "lucide-react";
import { paymentApi } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/badge";

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [orderId, setOrderId] = useState<string>("");
  const [resultType, setResultType] = useState<"order" | "voucher">("order");
  const [platformSlug, setPlatformSlug] = useState<string | null>(searchParams.get("platform"));
  const verifyStarted = useRef(false);

  useEffect(() => {
    if (verifyStarted.current) return;
    verifyStarted.current = true;

    const pt = searchParams.get("pt");
    const pn = searchParams.get("pn");
    const st = searchParams.get("st");

    if (!pt || !pn || !st) {
      setStatus("failed");
      return;
    }

    paymentApi
      .verifyPayment({ pt, pn, st })
      .then((res) => {
        setStatus(res.data.success ? "success" : "failed");
        setResultType(res.data.type === "voucher" ? "voucher" : "order");
        setOrderId(res.data.orderId ?? "");
        if (res.data.platformSlug) setPlatformSlug(res.data.platformSlug);
      })
      .catch(() => setStatus("failed"));
  }, [searchParams]);

  const isVoucher = resultType === "voucher";
  const voucherPurchasesPath = platformSlug ? `/voucher/${platformSlug}/purchases` : "/reftek";

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Skeleton className="h-48 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          {status === "success" ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h2 className="mt-4 text-xl font-bold">پرداخت موفق</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {isVoucher
                  ? "ووچر شما با موفقیت خریداری شد. می‌توانید کد را در پنل خریدهای خود مشاهده کنید."
                  : "سفارش شما با موفقیت ثبت شد. لطفاً منتظر بمانید تا تیم ما اشتراک شما را خریداری کند. پشتیبانی ممکن است با شما تماس بگیرد و کد تأیید ارسال‌شده به ایمیل شما را درخواست کند. در صورت عدم دسترسی، سفارش شما ممکن است با تأخیر انجام شود."}
              </p>
              {isVoucher ? (
                <Link to={voucherPurchasesPath}>
                  <Button className="mt-6">مشاهده ووچر</Button>
                </Link>
              ) : (
                orderId && (
                  <Link to={`/orders/${orderId}`}>
                    <Button className="mt-6">مشاهده سفارش</Button>
                  </Link>
                )
              )}
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <h2 className="mt-4 text-xl font-bold">پرداخت ناموفق</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                پرداخت انجام نشد. لطفاً دوباره تلاش کنید.
              </p>
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => navigate(isVoucher ? voucherPurchasesPath : "/orders")}
              >
                {isVoucher ? "بازگشت به ووچرها" : "بازگشت به سفارش‌ها"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
