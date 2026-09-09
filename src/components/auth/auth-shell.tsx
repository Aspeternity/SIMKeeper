import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArchiveRestore, ShieldCheck, Smartphone } from "lucide-react";
import { SiteMark } from "@/components/branding/site-mark";

export function AuthShell({
  siteName,
  siteDescription,
  logoUrl,
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
  pageMarker,
}: {
  siteName: string;
  siteDescription?: string | null;
  logoUrl: string | null;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  pageMarker: string;
}) {
  const highlights = [
    { icon: Smartphone, label: "号码生命周期", detail: "集中管理 SIM / eSIM、余额、有效期与保号事项" },
    { icon: ShieldCheck, label: "管理员保护", detail: "密码、会话与 TOTP 双重验证统一管理" },
    { icon: ArchiveRestore, label: "可恢复部署", detail: "完整备份与异地恢复用于迁移和灾难恢复" },
  ];

  return (
    <main
      className="sim-auth-shell min-h-screen bg-surface-subtle px-4 py-5 sm:px-6 sm:py-8 lg:flex lg:items-center lg:py-10"
      data-auth-shell="alpha.51.7"
      data-auth-page={pageMarker}
    >
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line bg-surface shadow-floating lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden min-h-[640px] overflow-hidden border-r border-line bg-brand-soft p-9 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand opacity-[0.07]" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full border-[42px] border-brand opacity-[0.05]" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <SiteMark logoUrl={logoUrl} className="h-12 w-12" iconClassName="h-6 w-6" />
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold tracking-tight text-ink">{siteName}</div>
                <div className="mt-0.5 text-xs font-medium text-brand">Self-hosted SIM lifecycle workspace</div>
              </div>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-6 text-ink-secondary">
              {siteDescription || "把号码资产、生命周期、同步状态和提醒集中在一个可自托管的工作台中。"}
            </p>
          </div>

          <div className="relative space-y-3">
            {highlights.map((item) => {
              const HighlightIcon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-brand/10 bg-surface/70 p-4 backdrop-blur-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft-strong text-brand">
                    <HighlightIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">{item.label}</div>
                    <div className="mt-1 text-xs leading-5 text-ink-muted">{item.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col justify-center p-5 sm:p-8 lg:p-10">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <SiteMark logoUrl={logoUrl} className="h-11 w-11" iconClassName="h-5 w-5" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-tight text-ink">{siteName}</div>
              {siteDescription ? <div className="mt-0.5 truncate text-xs text-ink-muted">{siteDescription}</div> : null}
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <header className="mb-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</div>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
              {description ? <div className="mt-2 text-sm leading-6 text-ink-secondary">{description}</div> : null}
            </header>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
