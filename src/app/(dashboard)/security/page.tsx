import AccountSecurityPage from "@/components/security/account-security-page";
import { TwoFactorSecurityPanel } from "@/components/security/two-factor-security-panel";

export default function SecurityPage() {
  return (
    <>
      <AccountSecurityPage />
      <TwoFactorSecurityPanel />
    </>
  );
}
