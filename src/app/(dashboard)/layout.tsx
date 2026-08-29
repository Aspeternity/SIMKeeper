import Link from "next/link";
import { LogIn, ShieldCheck, Smartphone } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { getCurrentUser, hasAdmin } from "@/lib/auth";

function AuthGate({ mode }: { mode: "setup" | "login" }) {
  const needsSetup = mode === "setup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          {needsSetup ? <ShieldCheck className="h-7 w-7" /> : <LogIn className="h-7 w-7" />}
        </div>
        <div className="mb-1 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
          <Smartphone className="h-4 w-4" />
          SIMKeeper
        </div>
        <h1 className="text-xl font-semibold">{needsSetup ? "需要完成首次初始化" : "需要登录"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {needsSetup
            ? "当前实例尚未创建管理员账户。完成初始化后即可进入管理后台。"
            : "当前浏览器没有有效的 SIMKeeper 登录会话。"}
        </p>
        <Link
          href={needsSetup ? "/setup" : "/login"}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {needsSetup ? "创建管理员" : "前往登录"}
        </Link>
      </Card>
    </main>
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!hasAdmin()) {
    return <AuthGate mode="setup" />;
  }

  const user = await getCurrentUser();
  if (!user) {
    return <AuthGate mode="login" />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar username={user.username} />
        <main className="p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
