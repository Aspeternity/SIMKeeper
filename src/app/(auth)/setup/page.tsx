import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { RemoteRecoverySetup } from "@/components/auth/remote-recovery-setup";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { hasAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function SetupPage({
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
      icon={ShieldCheck}
      eyebrow="首次初始化"
      title="创建或恢复 SIMKeeper"
      description="新安装可以创建管理员账户；灾难恢复场景也可以从 WebDAV 加密备份恢复完整实例。"
      pageMarker="setup-alpha.51.7"
    >
      <div data-auth-setup-polish="alpha.51.7">
        {initialized ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 text-sm leading-6 text-emerald-800">
              此实例已经完成初始化，不会再次创建管理员账户或开放未登录灾难恢复入口。
            </div>
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus"
            >
              前往登录
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <form action="/api/auth/setup" method="post" className="space-y-4">
              <FormField label="用户名" required hint="3–32 个字符，用于登录当前 SIMKeeper 实例。">
                <Input name="username" autoComplete="username" placeholder="admin" minLength={3} maxLength={32} autoFocus required />
              </FormField>
              <FormField
                label="密码"
                required
                hint="至少 10 个字符，最多 72 个 UTF-8 字节，避免 bcrypt 超长密码被静默截断。"
              >
                <Input name="password" type="password" autoComplete="new-password" placeholder="至少 10 个字符" minLength={10} required />
              </FormField>
              <FormField label="确认密码" required>
                <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
              </FormField>
              <Button className="mt-2 h-11 w-full" type="submit">
                <ShieldCheck className="mr-2 h-4 w-4" />创建管理员
              </Button>
            </form>

            <RemoteRecoverySetup />
          </>
        )}
      </div>
    </AuthShell>
  );
}
