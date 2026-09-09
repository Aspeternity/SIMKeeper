import {
  Activity,
  Database,
  HardDrive,
  History,
  ShieldCheck,
} from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Card } from "@/components/ui/card";
import { getDatabaseHealth } from "@/db/health";

export const dynamic = "force-dynamic";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

const TABLE_LABELS: Record<string, string> = {
  users: "管理员",
  carriers: "运营商",
  devices: "设备",
  sim_cards: "SIM",
  sim_bound_services: "绑定服务",
  sim_keep_alive_events: "保号/充值历史",
  sim_sync_snapshots: "同步快照",
  carrier_connector_attempts: "同步尝试",
  sim_lifecycle_events: "生命周期事件",
  condition_episodes: "条件事件",
  reminder_actions: "提醒处理记录",
  notification_deliveries: "通知投递记录",
};

export default function DatabaseSystemPage() {
  const health = getDatabaseHealth();
  const healthy = health.status === "healthy";

  return (
    <div className="space-y-6" data-database-foundation-version="alpha.47" data-settings-system-polish="alpha.51.4">
      <SettingsPageHeader
        icon={Database}
        eyebrow="System"
        title="系统与数据库"
        description="查看当前 SQLite、Schema Migration、完整性检查和数据规模。数据库升级由 SIMKeeper 自动执行，升级前先创建一致性快照，迁移失败则整笔事务回滚。"
      />

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${healthy ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">{healthy ? "数据库状态正常" : "数据库需要关注"}</div>
              <div className="mt-1 text-xs text-ink-secondary">
                quick_check：{health.quickCheck.status === "ok" ? "通过" : "异常"} · 外键异常：{health.foreignKeyViolations < 0 ? "检查失败" : health.foreignKeyViolations}
              </div>
            </div>
          </div>
          <div className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {healthy ? "Healthy" : "Attention"}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="text-xs text-ink-muted">SQLite</div>
          <div className="mt-2 text-xl font-semibold text-ink">v{health.sqliteVersion}</div>
          <div className="mt-1 text-xs text-ink-muted">Journal: {health.journalMode.toUpperCase()}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-ink-muted">Database Schema</div>
          <div className="mt-2 text-xl font-semibold text-ink">v{health.schemaVersion}</div>
          <div className="mt-1 text-xs text-ink-muted">目标 v{health.expectedSchemaVersion} · 待迁移 {health.pendingMigrations.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-ink-muted">数据库文件</div>
          <div className="mt-2 text-xl font-semibold text-ink">{formatBytes(health.databaseBytes)}</div>
          <div className="mt-1 text-xs text-ink-muted">WAL {formatBytes(health.walBytes)} · SHM {formatBytes(health.shmBytes)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-ink-muted">升级前快照</div>
          <div className="mt-2 text-xl font-semibold text-ink">{health.preMigrationBackups.count}</div>
          <div className="mt-1 truncate text-xs text-ink-muted">{health.preMigrationBackups.latest ?? "尚未产生"}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">Migration 历史</h3>
          </div>
          <div className="mt-4 space-y-3">
            {health.migrations.length ? health.migrations.map((migration) => (
              <div key={migration.version} className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">v{migration.version} · {migration.name}</div>
                  <div className="mt-1 text-xs text-ink-muted">{formatDateTime(migration.appliedAt)}</div>
                </div>
                <div className="shrink-0 text-xs text-ink-muted">{migration.durationMs} ms</div>
              </div>
            )) : (
              <div className="rounded-xl bg-surface-subtle p-4 text-sm text-ink-secondary">暂无 Migration 记录。</div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">完整性与存储</h3>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-surface-subtle p-4">
              <dt className="text-xs text-ink-muted">PRAGMA quick_check</dt>
              <dd className="mt-1 font-medium text-ink">{health.quickCheck.status === "ok" ? "通过" : "异常"}</dd>
            </div>
            <div className="rounded-xl bg-surface-subtle p-4">
              <dt className="text-xs text-ink-muted">Foreign Keys</dt>
              <dd className="mt-1 font-medium text-ink">{health.foreignKeysEnabled ? "已启用" : "未启用"}</dd>
            </div>
            <div className="rounded-xl bg-surface-subtle p-4">
              <dt className="text-xs text-ink-muted">Page Count</dt>
              <dd className="mt-1 font-medium text-ink">{health.pageCount.toLocaleString("zh-CN")}</dd>
            </div>
            <div className="rounded-xl bg-surface-subtle p-4">
              <dt className="text-xs text-ink-muted">Free Pages</dt>
              <dd className="mt-1 font-medium text-ink">{health.freePages.toLocaleString("zh-CN")} ({(health.freePageRatio * 100).toFixed(1)}%)</dd>
            </div>
          </dl>
          {health.quickCheck.messages.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
              {health.quickCheck.messages.join(" · ")}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink">主要数据表</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.entries(health.tableCounts).map(([table, count]) => (
            <div key={table} className="rounded-xl border border-line px-4 py-3">
              <div className="text-xs text-ink-secondary">{TABLE_LABELS[table] ?? table}</div>
              <div className="mt-1 text-lg font-semibold text-ink">{count.toLocaleString("zh-CN")}</div>
              <div className="mt-1 truncate font-mono text-[10px] text-ink-muted">{table}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
