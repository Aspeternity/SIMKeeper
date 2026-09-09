import { Smartphone } from "lucide-react";

export function SiteMark({
  logoUrl,
  className = "h-10 w-10",
  iconClassName = "h-5 w-5",
}: {
  logoUrl: string | null;
  className?: string;
  iconClassName?: string;
}) {
  if (logoUrl) {
    return (
      <div className={`${className} shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white`}>
        <img src={logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white`}>
      <Smartphone className={iconClassName} />
    </div>
  );
}
