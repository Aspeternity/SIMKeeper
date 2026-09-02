"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, DatabaseBackup, Download, FileJson, Loader2, Save, Settings, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type BackupItem = {
  name: string;
  createdAt: string;
  appVersion: string;
  reason: string;
  size: number;
  counts: Record<string, number>;
};

type BackupSummary = {
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  reason: string;
  counts: Record<string, number>;
};

type ImportedBackup = {
  fileName: string;
  raw: unknown;
  format?: unknown;
  appVersion?: unknown;
  createdAt?: unknown;
  tables?: Record<string, unknown>;
};

const countLabels: Record<string, string> = {
  carriers: "运营商",
  sim_cards: "号码",
  sim_tariffs: "资费档案",
  sim_keep_alive_rules: "保号规则",
  sim_keep_alive_events: "保号记录",
  sim_bound_services: "绑定服务",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function reasonLabel(reason: string) {
  if (reason === "manual") return "手动备份";
  if (reason === "pre-restore") return "恢复前安全备份";
  if (reason === "export") return "导出备份";
  return reason;
}

function SummaryCounts({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(countLabels).map(([key, label]) => (
        <span key={key} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-100">
          {label} {counts[key] ?? 0}
        </span>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [current, setCurrent] = useState<BackupSummary | null>(null);
  const [retention, setRetention] = useState("20");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState<ImportedBackup | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [backupsResponse, settingsResponse] = await Promise.all([
        fetch("/api/backups", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const [backupsData, settingsData] = await Promise.all([backupsResponse.json(), settingsResponse.json()]);
      if (!backupsResponse.ok) throw new Error(backupsData.error || "备份数据加载失败");
      if (!settingsResponse.ok) throw new Error(settingsData.error || "设置加载失败");
      setBackups(backupsData.backups || []);
      setCurrent(backupsData.current || null);
      setRetention(String(settingsData.backupRetention ?? 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const importedCounts = useMemo(() => {
    if (!imported?.tables) return {} as Record<string, number>;
    return Object.fromEntries(Object.entries(imported.tables).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
  }, [imported]);

  async function createBackup() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建备份失败");
      setNotice("本地备份已创建。");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建备份失败");
    } finally {
      setBusy("");
    }
  }

  async function saveRetention() {
    setBusy("retention");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backupRetention: retention }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "设置保存失败");
      setRetention(String(data.backupRetention));
      setNotice(`本地备份最多保留 ${data.backupRetention} 份。`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置保存失败");
    } finally {
      setBusy("");
    }
  }

  async function deleteBackup(item: BackupItem) {
    if (!window.confirm(`确定删除这份 ${formatDate(item.createdAt)} 的备份吗？此操作不可撤销。`)) return;
    setBusy(`delete:${item.name}`);
    setError("");
    try {
      const response = await fetch(`/api/backups?name=${encodeURIComponent(item.name)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除备份失败");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除备份失败");
    } finally {
      setBusy("");
    }
  }

  async function restoreLocal(item: BackupItem) {
    if (!window.confirm(`确定恢复 ${formatDate(item.createdAt)} 的完整备份吗？\n\n当前号码、资费、实名、保号、绑定服务、设置和管理员账户都会被备份中的数据替换。恢复前会自动创建一份安全备份。`)) return;
    setBusy(`restore:${item.name}`);
    setError("");
    try {
      const response = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restoreLocal", name: item.name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "恢复备份失败");
      window.alert(`恢复完成。系统已自动创建恢复前安全备份：${data.safetyBackup}`);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复备份失败");
      setBusy("");
    }
  }

  async function pickImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      setImported({
        fileName: file.name,
        raw,
        format: raw.format,
        appVersion: raw.appVersion,
        createdAt: raw.createdAt,
        tables: raw.tables && typeof raw.tables === "object" && !Array.isArray(raw.tables) ? raw.tables as Record<string, unknown> : undefined,
      });
    } catch {
      setImported(null);
      setError("无法读取这个 JSON 备份文件。");
    }
  }

  async function restoreImported() {
    if (!imported) return;
    if (!window.confirm(`确定导入并恢复“${imported.fileName}”吗？\n\n当前完整数据会被导入文件替换；系统会先自动创建恢复前安全备份。`)) return;
    setBusy("import");
    setError("");
    try {
      const response = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restoreImported", backup: imported.raw }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入恢复失败");
      window.alert(`导入恢复完成。恢复前安全备份：${data.safetyBackup}`);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入恢复失败");
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Settings className="h-4 w-4" />系统维护</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">设置与备份</h2>
        <p className="mt-1 text-sm text-slate-500">保护号码、实名、资费、保号和绑定服务数据，并为迁移到新实例保留可移植恢复路径。</p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium text-slate-900"><DatabaseBackup className="h-4 w-4 text-slate-400" />当前数据</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">完整备份包含管理员账户和实名资料，请把导出的文件按敏感数据妥善保存。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/api/backups?export=1" className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"><Download className="h-3.5 w-3.5" />导出 JSON</a>
              <button type="button" onClick={() => void createBackup()} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}创建本地备份</button>
            </div>
          </div>
          <div className="mt-5">{current ? <SummaryCounts counts={current.counts} /> : loading ? <div className="text-sm text-slate-400">正在统计数据…</div> : null}</div>
        </Card>

        <Card className="p-5">
          <div className="font-medium text-slate-900">本地备份保留策略</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">只限制自动维护的本地 JSON 备份数量；你下载到其他位置的导出文件不受影响。</p>
          <div className="mt-4 flex gap-2">
            <Input value={retention} onChange={(event) => setRetention(event.target.value)} type="number" min="1" max="100" className="max-w-36" />
            <button type="button" onClick={() => void saveRetention()} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === "retention" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存</button>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="font-medium text-slate-900">本地备份</div>
          <div className="mt-1 text-xs text-slate-400">备份保存在持久化数据目录的 backups 文件夹中。恢复前系统仍会额外创建一份安全备份。</div>
        </div>
        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载备份…</div>
        ) : backups.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center text-center"><DatabaseBackup className="h-6 w-6 text-slate-300" /><div className="mt-3 text-sm font-medium text-slate-600">还没有本地备份</div><div className="mt-1 text-xs text-slate-400">创建第一份备份后会显示在这里。</div></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backups.map((item) => (
              <div key={item.name} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-800">{formatDate(item.createdAt)}</span><span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-100">{reasonLabel(item.reason)}</span><span className="text-xs text-slate-400">{item.appVersion} · {formatSize(item.size)}</span></div>
                  <div className="mt-2"><SummaryCounts counts={item.counts} /></div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={`/api/backups?download=${encodeURIComponent(item.name)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"><Download className="h-3.5 w-3.5" />下载</a>
                  <button type="button" onClick={() => void restoreLocal(item)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === `restore:${item.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}恢复</button>
                  <button type="button" onClick={() => void deleteBackup(item)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">{busy === `delete:${item.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileJson className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-900">导入可移植备份</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">用于重装或迁移到新的 SIMKeeper 实例。导入是完整恢复，会覆盖当前数据；恢复前会自动生成本地安全备份。</p>
            <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              <Upload className="h-4 w-4" />选择 JSON 备份
              <input type="file" accept="application/json,.json" onChange={(event) => void pickImport(event)} className="hidden" />
            </label>

            {imported ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-slate-700">{imported.fileName}</div>
                    <div className="mt-1 text-xs text-slate-400">版本 {String(imported.appVersion ?? "未知")} · 创建于 {typeof imported.createdAt === "string" ? formatDate(imported.createdAt) : "未知"}</div>
                    <div className="mt-3"><SummaryCounts counts={importedCounts} /></div>
                  </div>
                  <button type="button" onClick={() => void restoreImported()} disabled={Boolean(busy)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}导入并恢复</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>备份包含实名姓名、证件号码、账号绑定标识和管理员密码哈希等敏感数据。请不要上传到公开仓库或公开网盘，也不要把备份文件作为普通日志分享。</span></div>
    </div>
  );
}
