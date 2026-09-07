import { ListChecks } from "lucide-react";
import { ReminderCenter } from "@/components/reminders/reminder-center";
import { listReminderActions } from "@/lib/reminder-actions";
import { getCurrentReminderItems } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RemindersPage() {
  const reminders = getCurrentReminderItems();
  const history = listReminderActions(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <ListChecks className="h-4 w-4" />
          统一待处理事项
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">处理中心</h2>
        <p className="mt-1 text-sm text-slate-500">铃铛与处理中心现在共用同一套待处理事项优先级；这里负责完成真实保号与有效期处理，“稍后提醒 / 忽略本轮”只调整当前事项的提醒节奏。</p>
      </div>

      <ReminderCenter reminders={reminders} history={history} />
    </div>
  );
}
