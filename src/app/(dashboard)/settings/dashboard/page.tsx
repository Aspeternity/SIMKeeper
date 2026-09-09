import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer";
import { getDashboardPreferences, getDashboardSimOptions } from "@/lib/dashboard-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardPersonalizationPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <DashboardCustomizer initialPreferences={getDashboardPreferences()} simOptions={getDashboardSimOptions()} />
    </div>
  );
}
