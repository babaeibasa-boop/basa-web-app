import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { adminApi } from "@/api";
import { useAdminAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "نام کاربری الزامی است"),
  password: z.string().min(1, "رمز عبور الزامی است"),
});

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (data) => {
    setLoading(true);
    try {
      const res = await adminApi.login(data.username, data.password);
      login(res.data.token, res.data.admin);
      navigate("/admin");
    } catch (err) {
      toast((err as Error).message, "destructive");
    } finally {
      setLoading(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ورود مدیر</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">نام کاربری</Label>
              <Input id="username" dir="ltr" {...form.register("username")} />
            </div>
            <div>
              <Label htmlFor="password">رمز عبور</Label>
              <Input id="password" type="password" dir="ltr" {...form.register("password")} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "در حال ورود..." : "ورود"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
