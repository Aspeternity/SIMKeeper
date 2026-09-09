"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileKey2,
  FileJson,
  KeyRound,
  Loader2,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ENCRYPTED_BACKUP_FORMAT = "simkeeper-encrypted-portable-backup";

type BackupValidation = "verified" | "legacy" | "invalid";

type BackupItem = {
  name: string;
  createdAt: string;
  appVersion: string;
  reason: string;
  size: number;
  counts: Record<string, number>;
  formatVersion: number | null;
  schemaVersion: number | null;
  validation: BackupValidation;
  error?: string;
};

type BackupSummary = {
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  reason: string;
  counts: Record<string, number>;
  validation: "verified" | "legacy";
  compatible: true;
  encrypted: boolean;
  warnings: string[];
};

type ImportedBackup = {
  fileName: string;
  raw: unknown;
  encrypted: boolean;
  outerAppVersion?: string;
  outerCreatedAt?: string;
};

const countLabels: Record<string, string> = {
  carriers: "运营商",
  sim_cards: "号码",
  carrier_connectors: "运营商连接",
  sim_esim_profiles: "eSIM 凭据",
  sim_keep_alive_rules: "保号规则",
  sim_keep_alive_events: "保号记录",
  sim_bound_services: "绑定服务",
  notification_channels: "通知渠道",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
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
  if (reason === "invalid") return "无法验证";
  return reason;
}

function validationLabel(validation: BackupValidation) {
  if (validation === "verified") return "完整性已校验";
  if (validation === "legacy") return "旧版无校验";
  return "备份异常";
}

function SummaryCounts({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(countLabels).map(([key, label]) => (
        <span
          key={key}
          className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-100"
        >
          {label} {counts[key] ?? 0}
        </span>
      ))}
    </div>
  );
}

function SummaryMeta({ summary }: { summary: BackupSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>SIMKeeper {summary.appVersion}</span>
        <span>·</span>
        <span>格式 v{summary.formatVersion}</span>
        <span>·</span>
        <span>Schema v{summary.schemaVersion}</span>
        <span>·</span>
        <span>{summary.encrypted ? "口令加密" : "未加密 / 本地"}</span>
      </div>
      <SummaryCounts counts={summary.counts} />
      {summary.warnings.length ? (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {summary.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          格式、结构和完整性校验均通过
        </div>
      )}
    </div>
  );
}

function getDownloadName(response: Response) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || `simkeeper-secure-backup-${Date.now()}.simkeeper-backup`;
}

export default function SettingsPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [current, setCurrent] = useState<BackupSummary | null>(null);
  const [retention, setRetention] = useState("20");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = useState("");
  const [imported, setImported] = useState<ImportedBackup | null>(null);
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importInspection, setImportInspection] = useState<BackupSummary | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [backupsResponse, settingsResponse] = await Promise.all([
        fetch("/api/backups", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const [backupsData, settingsData] = await Promise.all([
        backupsResponse.json(),
        settingsResponse.json(),
      ]);
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

  async function createBackup() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建备份失败");
      setNotice("本地备份已创建，并写入 SHA-256 完整性校验。");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建备份失败");
    } finally {
      setBusy("");
    }
  }

  async function exportEncrypted() {
    setError("");
    setNotice("");
    if (Array.from(exportPassphrase).length < 8) {
      setError("备份口令至少需要 8 个字符。");
      return;
    }
    if (exportPassphrase !== exportPassphraseConfirm) {
      setError("两次输入的备份口令不一致。");
      return;
    }

    setBusy("export");
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exportEncrypted", passphrase: exportPassphrase }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "加密备份导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getDownloadName(response);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportPassphrase("");
      setExportPassphraseConfirm("");
      setNotice("加密可移植备份已生成。请把备份文件与口令分开保存。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加密备份导出失败");
    } finally {
      setBusy("");
    }
  }

  async function saveRetention() {
    setBusy("retention");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupRetention: retention }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "设置保存失败");
      setRetention(String(data.backupRetention));
      setNotice(`本地有效备份最多保留 ${data.backupRetention} 份；异常备份不会被自动删除。`);
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
      const response = await fetch(`/api/backups?name=${encodeURIComponent(item.name)}`, {
        method: "DELETE",
      });
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
    if (item.validation === "invalid") return;
    if (!window.confirm(
      `确定恢复 ${formatDate(item.createdAt)} 的完整备份吗？\n\n当前号码、资费、实名、保号、绑定服务、连接器、通知设置和管理员账户都会被备份中的数据替换。恢复前会自动创建一份安全备份，并在事务内执行外键与 SQLite 完整性检查。`,
    )) return;

    setBusy(`restore:${item.name}`);
    setError("");
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restoreLocal", name: item.name }),
      });
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
    setImportPassphrase("");
    setImportInspection(null);

    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const encrypted = raw.format === ENCRYPTED_BACKUP_FORMAT;
      setImported({
        fileName: file.name,
        raw,
        encrypted,
        outerAppVersion: typeof raw.appVersion === "string" ? raw.appVersion : undefined,
        outerCreatedAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
      });
    } catch {
      setImported(null);
      setError("无法读取这个备份文件；文件不是有效的 JSON / SIMKeeper 备份封装。");
    }
  }

  async function inspectImported() {
    if (!imported) return;
    setBusy("inspect-import");
    setError("");
    setNotice("");
    setImportInspection(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inspectImported",
          backup: imported.raw,
          passphrase: imported.encrypted ? importPassphrase : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "备份验证失败");
      setImportInspection(data.summary);
      setNotice("备份验证通过。验证过程没有修改当前 SIMKeeper 数据。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "备份验证失败");
    } finally {
      setBusy("");
    }
  }

  async function restoreImported() {
    if (!imported || !importInspection) return;
    if (!window.confirm(
      `确定恢复“${imported.fileName}”吗？\n\n这份备份已经通过验证。当前完整数据会被替换；系统会先创建恢复前安全备份，并在恢复事务内再次进行完整性检查。`,
    )) return;

    setBusy("import");
    setError("");
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restoreImported",
          backup: imported.raw,
          passphrase: imported.encrypted ? importPassphrase : undefined,
        }),
      });
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
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Settings className="h-4 w-4" />系统维护
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">设置与备份</h2>
        <p className="mt-1 text-sm text-slate-500">
          本地备份用于快速回滚；加密可移植备份用于重装、迁移和离机保存。
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <DatabaseBackup className="h-4 w-4 text-slate-400" />当前数据与本地快照
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                本地备份保存在持久化 data/backups 中，使用 0600 文件权限，并从 v4 起写入 SHA-256 完整性摘要。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void createBackup()}
              disabled={Boolean(busy)}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}
              创建本地备份
            </button>
          </div>
          <div className="mt-5">
            {current ? <SummaryMeta summary={current} /> : loading ? <div className="text-sm text-slate-400">正在统计数据…</div> : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <FileKey2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">加密可移植备份</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                使用 scrypt 派生密钥并以 AES-256-GCM 加密整个备份，包括 eSIM / 运营商连接的凭据密钥。口令只用于本次导出，不会保存到 SIMKeeper。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">备份口令</label>
                  <Input
                    value={exportPassphrase}
                    onChange={(event) => setExportPassphrase(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 8 个字符"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">确认口令</label>
                  <Input
                    value={exportPassphraseConfirm}
                    onChange={(event) => setExportPassphraseConfirm(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[11px] leading-5 text-amber-600">SIMKeeper 无法找回备份口令；请把口令与备份文件分开保存。</div>
                <button
                  type="button"
                  onClick={() => void exportEncrypted()}
                  disabled={Boolean(busy)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  导出加密备份
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-medium text-slate-900">本地备份保留策略</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              只自动清理已通过验证的本地备份；损坏或无法验证的文件会保留，等待你手动检查或删除。
            </p>
          </div>
          <div className="flex gap-2">
            <Input value={retention} onChange={(event) => setRetention(event.target.value)} type="number" min="1" max="100" className="max-w-36" />
            <button
              type="button"
              onClick={() => void saveRetention()}
              disabled={Boolean(busy)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "retention" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="font-medium text-slate-900">本地备份</div>
          <div className="mt-1 text-xs text-slate-400">
            恢复前系统仍会额外创建一份 pre-restore 安全备份；恢复失败时数据库事务会自动回滚。
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载备份…</div>
        ) : backups.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <DatabaseBackup className="h-6 w-6 text-slate-300" />
            <div className="mt-3 text-sm font-medium text-slate-600">还没有本地备份</div>
            <div className="mt-1 text-xs text-slate-400">创建第一份备份后会显示在这里。</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backups.map((item) => (
              <div key={item.name} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{formatDate(item.createdAt)}</span>
                    <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-100">{reasonLabel(item.reason)}</span>
                    <span className={item.validation === "invalid" ? "rounded-md bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600" : item.validation === "legacy" ? "rounded-md bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700" : "rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"}>{validationLabel(item.validation)}</span>
                    <span className="text-xs text-slate-400">
                      {item.appVersion}{item.formatVersion ? ` · 格式 v${item.formatVersion}` : ""} · {formatSize(item.size)}
                    </span>
                  </div>
                  {item.validation === "invalid" ? (
                    <div className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-rose-600">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.error || "这份备份无法验证，已禁止恢复。"}
                    </div>
                  ) : (
                    <div className="mt-2"><SummaryCounts counts={item.counts} /></div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.validation !== "invalid" ? (
                    <>
                      <a href={`/api/backups?download=${encodeURIComponent(item.name)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"><Download className="h-3.5 w-3.5" />下载本地 JSON</a>
                      <button type="button" onClick={() => void restoreLocal(item)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === `restore:${item.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}恢复</button>
                    </>
                  ) : null}
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
            <div className="font-medium text-slate-900">验证并恢复可移植备份</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              先验证、后恢复。验证只会检查加密认证、SHA-256、格式版本和数据结构，不会修改当前数据库。alpha.39 及更早的未加密 JSON 仍可兼容导入。
            </p>
            <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              <Upload className="h-4 w-4" />选择备份文件
              <input type="file" accept="application/json,.json,.simkeeper-backup" onChange={(event) => void pickImport(event)} className="hidden" />
            </label>

            {imported ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-slate-700">{imported.fileName}</div>
                      <span className={imported.encrypted ? "rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700" : "rounded-md bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"}>{imported.encrypted ? "加密备份" : "旧版 / 未加密"}</span>
                    </div>
                    {imported.outerAppVersion || imported.outerCreatedAt ? (
                      <div className="mt-1 text-xs text-slate-400">
                        {imported.outerAppVersion ? `SIMKeeper ${imported.outerAppVersion}` : ""}
                        {imported.outerAppVersion && imported.outerCreatedAt ? " · " : ""}
                        {imported.outerCreatedAt ? `创建于 ${formatDate(imported.outerCreatedAt)}` : ""}
                      </div>
                    ) : null}

                    {imported.encrypted ? (
                      <div className="mt-4 max-w-md">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><KeyRound className="h-3.5 w-3.5" />备份口令</label>
                        <Input
                          value={importPassphrase}
                          onChange={(event) => {
                            setImportPassphrase(event.target.value);
                            setImportInspection(null);
                          }}
                          type="password"
                          autoComplete="current-password"
                          placeholder="输入创建备份时设置的口令"
                          className="mt-1"
                        />
                      </div>
                    ) : null}

                    {importInspection ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" />备份验证通过</div>
                        <SummaryMeta summary={importInspection} />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void inspectImported()}
                      disabled={Boolean(busy) || (imported.encrypted && !importPassphrase)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white disabled:opacity-50"
                    >
                      {busy === "inspect-import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      验证备份
                    </button>
                    <button
                      type="button"
                      onClick={() => void restoreImported()}
                      disabled={Boolean(busy) || !importInspection}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                      恢复已验证备份
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          本地 JSON 备份仍包含实名资料和凭据密钥，只适合保存在受控的持久化目录；需要复制到 NAS、云盘或其他设备时，请使用“加密可移植备份”。加密文件本身可以离机保存，但口令遗失后无法恢复。
        </span>
      </div>
    </div>
  );
}
