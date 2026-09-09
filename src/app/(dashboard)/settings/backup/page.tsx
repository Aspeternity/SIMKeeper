import { DatabaseBackup } from "lucide-react";
import BackupSettingsContent from "@/components/settings/backup-settings-page";
import RemoteBackupLibrary from "@/components/settings/remote-backup-library";
import RemoteBackupSettings from "@/components/settings/remote-backup-settings";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default function BackupSettingsPage() {
  return (
    <div className="space-y-6" data-settings-backup-polish="alpha.51.4">
      <SettingsPageHeader
        icon={DatabaseBackup}
        eyebrow="Recovery"
        title="备份与恢复"
        description="本地一致性快照用于快速回滚，加密可移植备份和 WebDAV 异地备份用于迁移与灾难恢复；所有恢复流程继续保留安全快照与完整性校验。"
      />
      <RemoteBackupSettings />
      <RemoteBackupLibrary />
      <div className="[&>div>div:first-child]:hidden">
        <BackupSettingsContent />
      </div>
    </div>
  );
}
