import { DatabaseBackup } from "lucide-react";
import BackupSettingsContent from "@/components/settings/backup-settings-page";
import RemoteBackupSettings from "@/components/settings/remote-backup-settings";

export default function BackupSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <DatabaseBackup className="h-4 w-4" />系统维护
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">备份与恢复</h2>
        <p className="mt-1 text-sm text-slate-500">
          本地快照用于快速回滚；加密可移植备份与自动 WebDAV 异地备份用于迁移和灾难恢复。
        </p>
      </div>
      <RemoteBackupSettings />
      <div className="[&>div>div:first-child]:hidden">
        <BackupSettingsContent />
      </div>
    </div>
  );
}
