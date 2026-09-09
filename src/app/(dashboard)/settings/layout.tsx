import type { ReactNode } from "react";
import { SettingsSectionNav } from "@/components/settings/settings-section-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1540px]" data-settings-shell="alpha.51.4">
      <div className="xl:grid xl:grid-cols-[250px_minmax(0,1fr)] xl:items-start xl:gap-7">
        <SettingsSectionNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
