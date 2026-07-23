import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { orderApi } from "@/api";
import { UserLayout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AiModelLogo } from "@/components/ai-model-logo";
import { AI_MODEL_LABELS, cn, formatPrice } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

const AI_MODELS = ["CHATGPT", "CLAUDE", "GEMINI"] as const;

type Step = 1 | 2 | 3 | 4;

type CredentialsForm = Record<string, string>;

function CredentialsStep({
  model,
  onBack,
  onNext,
}: {
  model: string;
  onBack: () => void;
  onNext: (credentials: CredentialsForm) => void;
}) {
  if (model === "GEMINI") {
    const schema = z.object({
      username: z.string().min(1, "نام کاربری الزامی است"),
      password: z.string().min(1, "رمز عبور الزامی است"),
    });
    const form = useForm({ resolver: zodResolver(schema) });
    return (
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <p className="text-sm text-muted-foreground">اطلاعات حساب <strong>Gemini</strong> خود را وارد کنید</p>
        <div>
          <Label htmlFor="username">نام کاربری</Label>
          <Input id="username" dir="ltr" {...form.register("username")} />
          {form.formState.errors.username && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.username.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="password">رمز عبور</Label>
          <Input id="password" type="password" dir="ltr" {...form.register("password")} />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>
        <div className="flex gap-2 pt-4">
          <Button className="cursor-pointer" type="button" variant="outline" onClick={onBack}>قبلی</Button>
          <Button className="cursor-pointer" type="submit">بعدی</Button>
        </div>
      </form>
    );
  }

  if (model === "CLAUDE") {
    const schema = z.object({ email: z.string().email("ایمیل معتبر وارد کنید") });
    const form = useForm({ resolver: zodResolver(schema) });
    return (
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <p className="text-sm text-muted-foreground">آدرس ایمیل ثبت شده در حساب <strong>Claude</strong> خود را وارد کنید</p>
        <div>
          <Label htmlFor="email">ایمیل</Label>
          <Input id="email" type="email" dir="ltr" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div className="flex gap-2 pt-4">
          <Button className="cursor-pointer" type="button" variant="outline" onClick={onBack}>قبلی</Button>
          <Button className="cursor-pointer" type="submit">بعدی</Button>
        </div>
      </form>
    );
  }

  const schema = z.object({
    email: z.string().email("ایمیل معتبر وارد کنید"),
    password: z.string().min(1, "رمز عبور الزامی است"),
  });
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
      <p className="text-sm text-muted-foreground">اطلاعات حساب <strong>ChatGPT</strong> خود را وارد کنید</p>
      <div>
        <Label htmlFor="email">ایمیلی که با آن ثبت نام کردید</Label>
        <Input id="email" type="email" dir="ltr" {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="password">رمز عبور حساب ChatGPT</Label>
        <Input id="password" type="password" dir="ltr" {...form.register("password")} />
        {form.formState.errors.password && (
          <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
        )}
      </div>
      <div className="flex gap-2 pt-4">
        <Button className="cursor-pointer" type="button" variant="outline" onClick={onBack}>قبلی</Button>
        <Button className="cursor-pointer" type="submit">بعدی</Button>
      </div>
    </form>
  );
}

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [credentials, setCredentials] = useState<CredentialsForm>({});

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["plans", selectedModel],
    queryFn: () => orderApi.getPlans(selectedModel),
    enabled: step >= 2 && !!selectedModel,
  });

  const createMutation = useMutation({
    mutationFn: orderApi.createOrder,
    onSuccess: (res) => {
      toast("سفارش با موفقیت ایجاد شد");
      navigate(`/orders/${res.data.id}`);
    },
    onError: (err: Error) => toast(err.message, "destructive"),
  });

  const plans = plansData?.data?.plans ?? [];
  const isSelectedPlanValid =
    selectedPlan !== null && plans.some((plan) => plan.title === selectedPlan.title);

  const handleModelSelect = (model: string) => {
    if (model !== selectedModel) {
      setSelectedPlan(null);
      setCredentials({});
    }
    setSelectedModel(model);
  };

  const goToStep1 = () => {
    setSelectedPlan(null);
    setStep(1);
  };

  return (
    <UserLayout>
      <h2 className="mb-6 text-xl font-bold">سفارش جدید</h2>

      <div className="mb-6 flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">مدل هوش مصنوعی را انتخاب کنید</p>
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {AI_MODELS.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => handleModelSelect(model)}
                className={cn(
                  "group flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-all duration-200 ease-out",
                  "hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  selectedModel === model
                    ? "border-primary ring-2 ring-primary"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="flex aspect-square w-full items-center justify-center">
                  <AiModelLogo
                    model={model}
                    className="h-[80px] w-[80px] transition-transform duration-200 ease-out group-hover:scale-110 md:h-[150px] md:w-[150px]"
                  />
                </div>
                <p className="text-sm font-medium transition-colors group-hover:text-primary">
                  {AI_MODEL_LABELS[model]}
                </p>
              </button>
            ))}
          </div>
          <Button className="cursor-pointer" disabled={!selectedModel} onClick={() => setStep(2)}>
            بعدی
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">پلن اشتراک را انتخاب کنید</p>
          {plansLoading && <Skeleton className="h-20 w-full" />}
          {plans.map((plan) => (
            <Card
              key={plan.title}
              className={`cursor-pointer transition-colors ${selectedPlan?.title === plan.title ? "border-primary ring-2 ring-primary" : "hover:bg-accent/50"}`}
              onClick={() => setSelectedPlan(plan)}
            >
              <CardContent className="flex items-center justify-between p-4 sm:pt-4">
                <p className="font-medium">{plan.title}</p>
                <p className="text-sm font-semibold text-primary">{formatPrice(plan.irrPrice)}</p>
              </CardContent>
            </Card>
          ))}
          <div className="flex gap-2 pt-4">
            <Button className="cursor-pointer" variant="outline" onClick={goToStep1}>قبلی</Button>
            <Button className="cursor-pointer" disabled={!isSelectedPlanValid} onClick={() => setStep(3)}>بعدی</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <CredentialsStep
          model={selectedModel}
          onBack={() => setStep(2)}
          onNext={(creds) => { setCredentials(creds); setStep(4); }}
        />
      )}

      {step === 4 && selectedPlan && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>تأیید سفارش</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">مدل:</span>
                <span>{AI_MODEL_LABELS[selectedModel]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">پلن:</span>
                <span>{selectedPlan.title}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>مبلغ:</span>
                <span className="text-primary">{formatPrice(selectedPlan.irrPrice)}</span>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button className="cursor-pointer" variant="outline" onClick={() => setStep(3)}>قبلی</Button>
            <Button
              className="cursor-pointer"
              disabled={createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  aiModel: selectedModel,
                  selectedPlan: selectedPlan.title,
                  credentials,
                })
              }
            >
              {createMutation.isPending ? "در حال ثبت..." : "ثبت سفارش"}
            </Button>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
