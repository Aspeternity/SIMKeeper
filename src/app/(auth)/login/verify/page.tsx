import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { SiteMark } from "@/components/branding/site-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPendingTwoFactorUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function TwoFactorVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const pendingUser = await getPendingTwoFactorUser();
  if (!pendingUser) {
    redirect("/login?error=双重验证会话已过期，请重新登录");
  }

  const siteSettings = getSiteSettings();
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4">
            <SiteMark logoUrl={siteSettings.logoUrl} className="h-14 w-14 shadow-lg shadow-slate-300" iconClassName="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{siteSettings.siteName}</h1>
          <p className="mt-2 text-sm text-slate-500">密码验证已通过，还需要完成第二步身份验证。</p>
        </div>

        <Card className="p-6 sm:p-7">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              双重验证
            </div>
            <h2 className="text-xl font-semibold">输入动态验证码</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              打开 Authenticator 应用输入当前 6 位验证码；如果手机不可用，也可以输入一枚尚未使用的恢复码。
            </p>
          </div>

          {error ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <form action="/api/auth/2fa/verify" method="post" className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">动态验证码或恢复码</span>
              <Input
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="123456 或 ABCD-EFGH-JKLM"
                autoFocus
                required
              />
            </label>
            <Button className="w-full" type="submit">
              <KeyRound className="mr-2 h-4 w-4" />验证并登录
            </Button>
          </form>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
            验证会话 5 分钟后失效。恢复码每枚只能使用一次，使用后请在“设置 → 账号安全”查看剩余数量。
          </div>
        </Card>
      </div>
    </main>
  );
}
