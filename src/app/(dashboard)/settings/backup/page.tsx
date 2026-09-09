import { DatabaseBackup } from "lucide-react";
import LegacyBackupPage from "../page";

export default function BackupSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <DatabaseBackup className="h-4 w-4" />系统维护
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">备份与恢复</h2>
        <p className="mt-1 text-sm text-slate-500">
          本地备份用于快速回滚；加密可移植备份用于重装、迁移和离机保存。
        </p>
      </div>
      <div className="[&>div>div:first-child]:hidden">
        <LegacyBackupPage />
      </div>
    </div>
  );
}
