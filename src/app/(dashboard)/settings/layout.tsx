import type { ReactNode } from "react";
import { SettingsSectionNav } from "@/components/settings/settings-section-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsSectionNav />
      {children}
    </>
  );
}
