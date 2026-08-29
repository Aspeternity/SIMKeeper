import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ username }: { username: string }) {
  return (
    <header className="flex h-20 items-center justify-between border-b bg-white px-5 sm:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">SIM lifecycle manager</p>
        <h1 className="mt-1 text-lg font-semibold">概览</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-10 w-10 px-0" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium">{username}</div>
          <div className="text-xs text-slate-400">Administrator</div>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button variant="secondary" className="gap-2" type="submit">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
