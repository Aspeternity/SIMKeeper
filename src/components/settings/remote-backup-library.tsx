"use client";

import { useState } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  CloudDownload,
  DatabaseBackup,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RemoteBackupFile = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  createdAt: string | null;
  instanceId: string | null;
  scope: "current" | "other" | "legacy";
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

type Inspection = {
  file: RemoteBackupFile;
  digest: string;
  summary: BackupSummary;
};

function formatDate(value: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatSize(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function scopeLabel(scope: RemoteBackupFile["scope"]) {
  if (scope === "current") return "当前实例";
  if (scope === "other") return "其他实例";
  return "旧版备份";
}

function scopeClass(scope: RemoteBackupFile["scope"]) {
  if (scope === "current") return "bg-emerald-50 text-emerald-700";
  if (scope === "other") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-500";
}

export default function RemoteBackupLibrary() {
  const [backups, setBackups] = useState<RemoteBackupFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadRemote() {
    setBusy("list");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listRemote" }),
      });
      const data = await response.json() as { backups?: RemoteBackupFile[]; error?: string };
      if (!response.ok || !Array.isArray(data.backups)) throw new Error(data.error || "远端备份库读取失败");
      setBackups(data.backups);
      setLoaded(true);
      setInspection(null);
      setNotice(`已从 WebDAV 读取 ${data.backups.length} 份可恢复的加密备份。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "远端备份库读取失败");
    } finally {
      setBusy("");
    }
  }

  async function inspect(file: RemoteBackupFile) {
    if (!passphrase) {
      setError("请输入异地备份加密口令后再验证。这样也可以确认你确实保留了灾难恢复所需的口令。");
      return;
    }
    setBusy(`inspect:${file.name}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspectRemote", name: file.name, passphrase }),
      });
      const data = await response.json() as { inspection?: Inspection; error?: string };
      if (!response.ok || !data.inspection) throw new Error(data.error || "远端备份验证失败");
      setInspection(data.inspection);
      setNotice("远端文件已下载、解密，并通过可移植备份完整性与兼容性检查。没有修改当前数据库。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "远端备份验证失败");
    } finally {
      setBusy("");
    }
  }

  async function restore(file: RemoteBackupFile) {
    if (!passphrase) {
      setError("请输入异地备份加密口令后再恢复。");
      return;
    }
    const confirmed = window.confirm(
      `确定从远端恢复这份备份吗？\n\n${file.name}\n${formatDate(file.createdAt || file.modifiedAt)}\n\nSIMKeeper 会先为当前数据库创建安全备份，然后用远端数据替换当前业务数据。恢复后的自动异地备份会保持暂停，必须重新测试连接并手动启用。`,
    );
    if (!confirmed) return;

    setBusy(`restore:${file.name}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restoreRemote", name: file.name, passphrase, confirm: "RESTORE" }),
      });
      const data = await response.json() as { result?: { safetyBackup?: string }; error?: string; loginRequired?: boolean };
      if (!response.ok || !data.result) throw new Error(data.error || "远端备份恢复失败");
      setNotice(`恢复完成；恢复前安全备份：${data.result.safetyBackup || "已创建"}。正在返回登录页…`);
      window.setTimeout(() => window.location.assign("/login"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "远端备份恢复失败");
      setBusy("");
    }
  }

  return (
    <Card className="mx-auto max-w-7xl overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-medium text-slate-900"><CloudDownload className="h-4 w-4 text-slate-400" />远端备份库</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">直接读取当前 WebDAV 目录。文件名中的实例标识用于隔离自动清理，但当前实例仍可以手动验证并恢复其他实例或 alpha.48/49 的旧版备份。</p>
        </div>
        <button type="button" onClick={() => void loadRemote()} disabled={Boolean(busy)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === "list" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{loaded ? "刷新远端列表" : "读取远端备份"}</button>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <label className="block max-w-xl">
          <span className="text-xs font-medium text-slate-600">验证 / 恢复口令</span>
          <Input value={passphrase} onChange={(event) => setPassphrase(event.target.value)} type="password" autoComplete="new-password" placeholder="输入你另外保存的异地备份口令" className="mt-1" />
        </label>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">这里故意要求重新输入，而不是直接使用服务器上保存的无人值守口令；这样能真实验证灾难恢复时你手里的外部口令是否可用。</p>
      </div>

      {error ? <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {inspection ? (
        <div className="mx-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><ShieldCheck className="h-4 w-4" />已验证：{inspection.file.name}</div>
          <div className="mt-3 grid gap-2 text-xs text-emerald-800 sm:grid-cols-2 lg:grid-cols-4">
            <div>创建时间<br /><span className="font-medium">{formatDate(inspection.summary.createdAt)}</span></div>
            <div>SIMKeeper<br /><span className="font-medium">{inspection.summary.appVersion}</span></div>
            <div>号码数量<br /><span className="font-medium">{inspection.summary.counts.sim_cards ?? 0}</span></div>
            <div>格式 / Schema<br /><span className="font-medium">v{inspection.summary.formatVersion} / v{inspection.summary.schemaVersion}</span></div>
          </div>
          <div className="mt-3 break-all font-mono text-[10px] text-emerald-700/60">远端文件 SHA-256 {inspection.digest}</div>
          {inspection.summary.warnings.length ? <div className="mt-3 text-xs leading-5 text-amber-700">{inspection.summary.warnings.join(" ")}</div> : null}
        </div>
      ) : null}

      {!loaded ? (
        <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center text-sm text-slate-400"><DatabaseBackup className="mb-3 h-6 w-6 text-slate-300" />点击“读取远端备份”后才连接 WebDAV，不会因为打开设置页面就额外产生远端请求。</div>
      ) : backups.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center text-sm text-slate-400"><DatabaseBackup className="mb-3 h-6 w-6 text-slate-300" />当前远端目录没有可识别的 SIMKeeper 加密备份。</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {backups.map((file) => {
            const inspecting = busy === `inspect:${file.name}`;
            const restoring = busy === `restore:${file.name}`;
            return (
              <div key={file.name} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all text-sm font-medium text-slate-800">{file.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${scopeClass(file.scope)}`}>{scopeLabel(file.scope)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(file.createdAt || file.modifiedAt)} · {formatSize(file.size)}{file.instanceId ? ` · Instance ${file.instanceId}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => void inspect(file)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{inspecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}验证</button>
                    <button type="button" onClick={() => void restore(file)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}恢复</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
