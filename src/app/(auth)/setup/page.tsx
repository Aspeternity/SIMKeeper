import { ShieldCheck, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAdminCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (getAdminCount() > 0) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300">
            <Smartphone className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">SIMKeeper</h1>
          <p className="mt-2 text-sm text-slate-500">Keep every number alive.</p>
        </div>

        <Card className="p-6 sm:p-7">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4" />
              首次初始化
            </div>
            <h2 className="text-xl font-semibold">创建管理员账户</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              账户信息保存在本机 SQLite 数据库中，不需要在 Compose 里预设用户名和密码。
            </p>
          </div>

          {error ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <form action="/api/auth/setup" method="post" className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">用户名</span>
              <Input name="username" autoComplete="username" placeholder="admin" minLength={3} maxLength={32} required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">密码</span>
              <Input name="password" type="password" autoComplete="new-password" placeholder="至少 8 个字符" minLength={8} required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">确认密码</span>
              <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <Button className="mt-2 w-full" type="submit">创建管理员</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
