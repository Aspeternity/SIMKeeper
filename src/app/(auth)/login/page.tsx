import Link from "next/link";
import { LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { hasAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const initialized = hasAdmin();
  const siteSettings = getSiteSettings();
  const { error } = await searchParams;

  return (
    <AuthShell
      siteName={siteSettings.siteName}
      siteDescription={siteSettings.siteDescription}
      logoUrl={siteSettings.logoUrl}
      icon={LogIn}
      eyebrow="管理后台"
      title={`登录 ${siteSettings.siteName}`}
      description="使用管理员账户进入号码、生命周期、同步状态与提醒工作台。"
      pageMarker="login-alpha.51.7"
    >
      <div data-auth-login-polish="alpha.51.7">
        {!initialized ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 text-sm leading-6 text-amber-800">
              当前实例还没有管理员账户，请先完成首次初始化。
            </div>
            <Link
              href="/setup"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus"
            >
              前往初始化
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <form action="/api/auth/login" method="post" className="space-y-4">
              <FormField label="用户名" required>
                <Input name="username" autoComplete="username" autoFocus required />
              </FormField>
              <FormField label="密码" required>
                <Input name="password" type="password" autoComplete="current-password" required />
              </FormField>
              <Button className="mt-2 h-11 w-full" type="submit">
                <LogIn className="mr-2 h-4 w-4" />登录
              </Button>
            </form>

            <div className="mt-5 rounded-xl border border-line bg-surface-subtle px-3.5 py-3 text-xs leading-5 text-ink-muted">
              登录成功后会建立受服务端签名保护的管理员会话；如果账户已启用 TOTP，会继续进入第二步验证。
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
