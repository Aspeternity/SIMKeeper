import { LogIn, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAdminCount, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (getAdminCount() === 0) redirect("/setup");
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300">
            <Smartphone className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">SIMKeeper</h1>
          <p className="mt-2 text-sm text-slate-500">Self-hosted SIM & eSIM lifecycle manager</p>
        </div>

        <Card className="p-6 sm:p-7">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <LogIn className="h-4 w-4" />
              管理后台
            </div>
            <h2 className="text-xl font-semibold">登录 SIMKeeper</h2>
          </div>

          {error ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {decodeURIComponent(error)}
            </div>
          ) : null}

          <form action={loginAction} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">用户名</span>
              <Input name="username" autoComplete="username" required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">密码</span>
              <Input name="password" type="password" autoComplete="current-password" required />
            </label>
            <Button className="mt-2 w-full" type="submit">登录</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
