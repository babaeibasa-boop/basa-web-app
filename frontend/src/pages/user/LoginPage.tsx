import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { authApi } from "@/api";
import { useAuth, useTheme } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { parseDigitInput, safeRedirectPath, toCanonicalLoginPhone } from "@/lib/utils";

const postLoginPath = import.meta.env.PROD ? "/reftek" : "/orders";
const OTP_TTL_SECONDS = 90;
const OTP_LENGTH = 6;

type Step = "phone" | "otp";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("phone");
  const [nationalPhone, setNationalPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [canonicalPhone, setCanonicalPhone] = useState("");
  const captchaRequestId = useRef(0);

  const redirectParam = searchParams.get("redirect");
  const nextPath = safeRedirectPath(redirectParam, postLoginPath);
  const timerActive = secondsLeft > 0;

  const captchaSrc = useMemo(
    () =>
      captchaSvg
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg)}`
        : undefined,
    [captchaSvg],
  );

  const loadCaptcha = useCallback(async () => {
    const requestId = ++captchaRequestId.current;
    setCaptchaLoading(true);
    setCaptchaCode("");
    try {
      const res = await authApi.getCaptcha();
      if (requestId !== captchaRequestId.current) return;
      setCaptchaId(res.data.captchaId);
      setCaptchaSvg(res.data.svg);
    } catch (err) {
      if (requestId !== captchaRequestId.current) return;
      toast((err as Error).message, "destructive");
    } finally {
      if (requestId === captchaRequestId.current) {
        setCaptchaLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => {
    if (!timerActive) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerActive]);

  if (isAuthenticated) {
    return <Navigate to={nextPath} replace />;
  }

  const onPhoneChange = (value: string) => {
    const digits = parseDigitInput(value).slice(0, 10);
    setNationalPhone(digits);
    if (!digits) {
      setPhoneError(null);
      return;
    }
    if (digits.startsWith("0")) {
      setPhoneError("شماره موبایل نباید با ۰ شروع شود");
      return;
    }
    if (digits.length < 10) {
      setPhoneError(null);
      return;
    }
    if (digits.length === 10 && !/^9\d{9}$/.test(digits)) {
      setPhoneError("شماره موبایل نامعتبر است");
      return;
    }
    setPhoneError(null);
  };

  const validatePhone = (): string | null => {
    if (nationalPhone.startsWith("0")) {
      return "شماره موبایل نباید با ۰ شروع شود";
    }
    if (nationalPhone.length !== 10) {
      return "شماره موبایل باید ۱۰ رقم باشد";
    }
    if (!/^9\d{9}$/.test(nationalPhone)) {
      return "شماره موبایل نامعتبر است";
    }
    return null;
  };

  const sendOtp = async () => {
    const error = validatePhone();
    if (error) {
      setPhoneError(error);
      return;
    }
    if (!captchaCode.trim()) {
      toast("کد کپچا را وارد کنید", "destructive");
      return;
    }

    const phone = toCanonicalLoginPhone(nationalPhone);
    setLoading(true);
    try {
      const res = await authApi.requestOtp({
        phone,
        captchaId,
        captchaCode: captchaCode.trim(),
      });
      setCanonicalPhone(phone);
      setOtpCode("");
      setCaptchaCode("");
      setSecondsLeft(res.data.expiresIn || OTP_TTL_SECONDS);
      setStep("otp");
      toast("کد تایید ارسال شد");
    } catch (err) {
      toast((err as Error).message, "destructive");
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (secondsLeft > 0) return;
    if (!captchaCode.trim()) {
      toast("برای ارسال مجدد، کد کپچا را وارد کنید", "destructive");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.requestOtp({
        phone: canonicalPhone || toCanonicalLoginPhone(nationalPhone),
        captchaId,
        captchaCode: captchaCode.trim(),
      });
      setOtpCode("");
      setCaptchaCode("");
      setSecondsLeft(res.data.expiresIn || OTP_TTL_SECONDS);
      toast("کد تایید مجدداً ارسال شد");
      await loadCaptcha();
    } catch (err) {
      toast((err as Error).message, "destructive");
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const editPhone = async () => {
    setStep("phone");
    setOtpCode("");
    setSecondsLeft(0);
    setCaptchaCode("");
    await loadCaptcha();
  };

  const verify = async () => {
    const code = parseDigitInput(otpCode);
    if (code.length !== OTP_LENGTH) {
      toast("کد تایید باید ۶ رقم باشد", "destructive");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({
        phone: canonicalPhone || toCanonicalLoginPhone(nationalPhone),
        code,
      });
      login(res.data.token, res.data.user);
      navigate(nextPath, { replace: true });
    } catch (err) {
      toast((err as Error).message, "destructive");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute end-4 top-4"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
      >
        {theme === "dark" ? "روشن" : "تاریک"}
      </Button>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ورود با شماره موبایل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "phone" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void sendOtp();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="phone">شماره موبایل</Label>
                <div
                  dir="ltr"
                  className="flex flex-row items-stretch overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-ring"
                >
                  <span className="flex items-center border-e bg-muted px-3 text-sm font-medium text-muted-foreground">
                    98
                  </span>
                  <Input
                    id="phone"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="شماره همراه بدون صفر"
                    maxLength={10}
                    value={nationalPhone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    className="rounded-none border-0 focus-visible:ring-0"
                    aria-invalid={Boolean(phoneError)}
                  />
                </div>
                {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="captcha">کپچا</Label>
                <div className="flex items-center gap-2">
                  <div className="flex h-14 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {captchaSrc ? (
                      <img src={captchaSrc} alt="کپچا" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void loadCaptcha()}
                    disabled={captchaLoading}
                    aria-label="تازه‌سازی کپچا"
                  >
                    <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <Input
                  id="captcha"
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="کد تصویر را وارد کنید"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || Boolean(phoneError) || nationalPhone.length !== 10}
              >
                {loading ? "در حال ارسال..." : "دریافت کد تایید"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">کد تایید به این شماره ارسال شد:</p>
                <p className="font-medium tracking-wide" dir="ltr">
                  {canonicalPhone}
                </p>
                <Button type="button" variant="link" className="h-auto px-0" onClick={() => void editPhone()}>
                  ویرایش شماره موبایل
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="otp">کد تایید</Label>
                <Input
                  id="otp"
                  dir="ltr"
                  inputMode="numeric"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="------"
                  maxLength={OTP_LENGTH}
                  value={otpCode}
                  onChange={(e) => setOtpCode(parseDigitInput(e.target.value).slice(0, OTP_LENGTH))}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground" dir="ltr">
                  {secondsLeft > 0 ? formatTimer(secondsLeft) : "00:00"}
                </span>
                {secondsLeft > 0 ? (
                  <span className="text-muted-foreground">تا ارسال مجدد</span>
                ) : (
                  <span className="text-muted-foreground">می‌توانید دوباره درخواست دهید</span>
                )}
              </div>

              {secondsLeft <= 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label htmlFor="resend-captcha">کپچا برای ارسال مجدد</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-14 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                      {captchaSrc ? (
                        <img src={captchaSrc} alt="کپچا" className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void loadCaptcha()}
                      disabled={captchaLoading}
                      aria-label="تازه‌سازی کپچا"
                    >
                      <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  <Input
                    id="resend-captcha"
                    dir="ltr"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="کد تصویر را وارد کنید"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={() => void resendOtp()}
                  >
                    ارسال مجدد کد
                  </Button>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading || otpCode.length !== OTP_LENGTH}>
                {loading ? "در حال بررسی..." : "ورود"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
