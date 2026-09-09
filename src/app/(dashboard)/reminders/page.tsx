import { ListChecks } from "lucide-react";
import { BackupAttentionPanel } from "@/components/reminders/backup-attention-panel";
import { ReminderCenterLive } from "@/components/reminders/reminder-center-live";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { listReminderActions } from "@/lib/reminder-actions";
import { getRemoteBackupAttentionItems } from "@/lib/remote-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RemindersPage() {
  const reminders = getUnifiedReminderItems();
  const history = listReminderActions(100);
  const backupAttention = getRemoteBackupAttentionItems();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <ListChecks className="h-4 w-4" />
          统一待处理事项
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">处理中心</h2>
        <p className="mt-1 text-sm text-slate-500">号码生命周期、余额与同步状态继续按 SIM 管理；异地备份等实例级故障会作为系统维护事项单独展示，避免和号码任务混淆。</p>
      </div>

      <BackupAttentionPanel items={backupAttention} />
      <ReminderCenterLive reminders={reminders} history={history} />
    </div>
  );
}
