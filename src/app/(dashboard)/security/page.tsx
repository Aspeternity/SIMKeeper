import { ShieldCheck } from "lucide-react";
import AccountSecurityPage from "@/components/security/account-security-page";
import { TwoFactorSecurityPanel } from "@/components/security/two-factor-security-panel";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default function SecurityPage() {
  return (
    <div className="sim-security-polish space-y-6" data-security-polish="alpha.51.7">
      <SettingsPageHeader
        icon={ShieldCheck}
        eyebrow="Security"
        title="账号与安全"
        description="管理管理员账户、密码、登录会话与 TOTP 双重验证，并通过最近安全活动快速检查敏感操作和异常登录。"
      />

      <section className="sim-security-account-panel" aria-label="管理员账户与会话">
        <AccountSecurityPage />
      </section>

      <section className="sim-security-two-factor" aria-label="双重验证与安全活动">
        <TwoFactorSecurityPanel />
      </section>
    </div>
  );
}
