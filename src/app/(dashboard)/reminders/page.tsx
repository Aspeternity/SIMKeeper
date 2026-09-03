import { BellRing } from "lucide-react";
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
          <BellRing className="h-4 w-4" />
          生命周期提醒
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">提醒中心</h2>
        <p className="mt-1 text-sm text-slate-500">“完成处理”会要求记录真实活动并推动生命周期日期；“稍后提醒 / 忽略本轮”只改变提醒节奏，不会改变保号管理中的真实状态。</p>
      </div>

      <ReminderCenter reminders={reminders} history={history} />
    </div>
  );
}
