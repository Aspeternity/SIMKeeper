import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
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
    <AuthShell
      siteName={siteSettings.siteName}
      siteDescription={siteSettings.siteDescription}
      logoUrl={siteSettings.logoUrl}
      icon={ShieldCheck}
      eyebrow="双重验证"
      title="输入动态验证码"
      description="密码验证已通过。请完成第二步身份验证后进入管理后台。"
      pageMarker="verify-alpha.51.7"
    >
      <div data-auth-verify-polish="alpha.51.7">
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          管理员密码已验证
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {error}
          </div>
        ) : null}

        <form action="/api/auth/2fa/verify" method="post" className="space-y-4">
          <FormField
            label="动态验证码或恢复码"
            required
            hint="可输入 Authenticator 当前 6 位验证码，或一枚尚未使用的恢复码。"
          >
            <Input
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="123456 或 ABCD-EFGH-JKLM"
              autoFocus
              required
              className="font-mono tracking-wide"
            />
          </FormField>
          <Button className="h-11 w-full" type="submit">
            <KeyRound className="mr-2 h-4 w-4" />验证并登录
          </Button>
        </form>

        <div className="mt-5 rounded-xl border border-line bg-surface-subtle px-3.5 py-3 text-xs leading-5 text-ink-muted">
          验证会话 5 分钟后失效。恢复码每枚只能使用一次，使用后可在“设置 → 账号安全”查看剩余数量。
        </div>
      </div>
    </AuthShell>
  );
}
