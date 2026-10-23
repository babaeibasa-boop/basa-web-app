import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { authApi, creditApi } from "@/api";
import { CreditsLayout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { isValidNationalCode, parseDigitInput } from "@/lib/utils";

function NationalCodeForm() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [nationalCode, setNationalCode] = useState("");
  const [localError, setLocalError] = useState("");

  const mutation = useMutation({
    mutationFn: (value: string) => creditApi.submitNationalCode(value),
    onSuccess: (res) => {
      queryClient.setQueryData(["auth-profile"], res);
      if (user) {
        updateUser({ ...user, ...res.data, hasNationalCode: true });
      }
    },
  });

  const canSubmit = isValidNationalCode(nationalCode);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setLocalError("کد ملی باید ۱۰ رقم باشد");
      return;
    }
    setLocalError("");
    mutation.mutate(nationalCode);
  };

  const errorMessage = localError || mutation.error?.message;

  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CreditCard className="h-6 w-6" />
        </div>
        <CardTitle>ثبت کد ملی</CardTitle>
        <CardDescription>برای مشاهده اعتبارها، کد ملی خود را وارد کنید.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nationalCode">کد ملی</Label>
            <Input
              id="nationalCode"
              name="nationalCode"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="0012345678"
              value={nationalCode}
              onChange={(event) => {
                setNationalCode(parseDigitInput(event.target.value).slice(0, 10));
                setLocalError("");
                mutation.reset();
              }}
            />
            <p className="text-xs text-muted-foreground">کد ملی باید ۱۰ رقم باشد و می‌تواند با صفر شروع شود.</p>
          </div>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <Button type="submit" className="w-full" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "در حال بررسی..." : "تأیید"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function NationalCodeGate({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth-profile"],
    queryFn: () => authApi.getProfile(),
  });

  if (isLoading) {
    return (
      <CreditsLayout>
        <div className="mx-auto mt-8 max-w-md space-y-3">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CreditsLayout>
    );
  }

  if (error) {
    return (
      <CreditsLayout>
        <EmptyState title="خطا در دریافت اطلاعات کاربر" description={error.message} />
      </CreditsLayout>
    );
  }

  if (!data?.data?.hasNationalCode) {
    return (
      <CreditsLayout>
        <NationalCodeForm />
      </CreditsLayout>
    );
  }

  return <>{children}</>;
}
