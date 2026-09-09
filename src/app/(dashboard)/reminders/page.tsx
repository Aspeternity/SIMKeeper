import { BackupAttentionPanel } from "@/components/reminders/backup-attention-panel";
import { ProcessingCenterHeader } from "@/components/reminders/processing-center-header";
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
    <div
      className="mx-auto max-w-[1440px] space-y-7"
      data-processing-center-page="alpha.51.6"
    >
      <ProcessingCenterHeader />
      <BackupAttentionPanel items={backupAttention} />
      <ReminderCenterLive reminders={reminders} history={history} />
    </div>
  );
}
