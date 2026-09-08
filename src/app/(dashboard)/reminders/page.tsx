import { ListChecks } from "lucide-react";
import { ReminderCenter } from "@/components/reminders/reminder-center";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { listReminderActions } from "@/lib/reminder-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RemindersPage() {
  const reminders = getUnifiedReminderItems();
  const history = listReminderActions(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <ListChecks className="h-4 w-4" />
          统一待处理事项
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">处理中心</h2>
        <p className="mt-1 text-sm text-slate-500">号码有效期、保号规则与低余额状态共用同一套待处理事项；真实数据恢复正常后事项会自动解除，“稍后提醒 / 忽略本轮”只调整当前这一轮的提醒节奏。</p>
      </div>

      <ReminderCenter reminders={reminders} history={history} />
    </div>
  );
}
