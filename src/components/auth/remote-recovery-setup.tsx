"use client";

import { useState } from "react";
import { ArchiveRestore, CheckCircle2, CloudDownload, Loader2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

type RemoteBackupFile = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  createdAt: string | null;
  instanceId: string | null;
  scope: "current" | "other" | "legacy";
};

type Inspection = {
  file: RemoteBackupFile;
  digest: string;
  summary: {
    appVersion: string;
    createdAt: string;
    formatVersion: number;
    schemaVersion: number;
    counts: Record<string, number>;
    warnings: string[];
  };
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
    hour12: false,
  }).format(date);
}

function formatSize(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function RemoteRecoverySetup() {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [remotePath, setRemotePath] = useState("/SIMKeeper");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [backups, setBackups] = useState<RemoteBackupFile[]>([]);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function connection() {
    return { endpoint, remotePath, username, password: password || undefined };
  }

  async function listRemote() {
    setBusy("list");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/setup/remote-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", connection: connection() }),
      });
      const data = await response.json() as { backups?: RemoteBackupFile[]; error?: string };
      if (!response.ok || !Array.isArray(data.backups)) throw new Error(data.error || "远端备份读取失败");
      setBackups(data.backups);
      setInspection(null);
      setNotice(`已找到 ${data.backups.length} 份可识别的 SIMKeeper 加密备份。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "远端备份读取失败");
    } finally {
      setBusy("");
    }
  }

  async function inspect(file: RemoteBackupFile) {
    if (!passphrase) {
      setError("请输入异地备份加密口令。");
      return;
    }
    setBusy(`inspect:${file.name}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/setup/remote-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect", connection: connection(), name: file.name, passphrase }),
      });
      const data = await response.json() as { inspection?: Inspection; error?: string };
      if (!response.ok || !data.inspection) throw new Error(data.error || "备份验证失败");
      setInspection(data.inspection);
      setNotice("备份口令正确，远端文件已通过解密、完整性和兼容性检查。现在可以安全进入恢复步骤。 ");
    } catch (err) {
      setError(err instanceof Error ? err.message : "备份验证失败");
    } finally {
      setBusy("");
    }
  }

  async function restore(file: RemoteBackupFile) {
    if (!passphrase) {
      setError("请输入异地备份加密口令。");
      return;
    }
    if (!window.confirm(`从 ${formatDate(file.createdAt || file.modifiedAt)} 的远端备份恢复这个空实例吗？\n\n恢复后将使用备份中的管理员账号、2FA、SIM/eSIM、运营商、提醒和设置。自动异地备份会保持暂停，避免与原实例冲突。`)) return;

    setBusy(`restore:${file.name}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/setup/remote-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", connection: connection(), name: file.name, passphrase, confirm: "RESTORE" }),
      });
      const data = await response.json() as { result?: unknown; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "灾难恢复失败");
      setNotice("灾难恢复完成。正在进入登录页，请使用备份中的管理员账号以及原有 2FA 登录。 ");
      window.setTimeout(() => window.location.assign("/login"), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "灾难恢复失败");
      setBusy("");
    }
  }

  if (!open) {
    return (
      <div className="mt-5 border-t border-slate-100 pt-5">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <ArchiveRestore className="h-4 w-4" />从异地备份恢复
        </button>
        <p className="mt-2 text-center text-xs leading-5 text-slate-400">适用于原 SIMKeeper 主机损坏后，在一个全新实例上从 WebDAV 恢复。</p>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><CloudDownload className="h-4 w-4" />从 WebDAV 灾难恢复</div>
      <p className="mt-1 text-xs leading-5 text-slate-400">这些连接信息只用于本次恢复。恢复完成后会使用备份里的配置，但自动调度会强制保持关闭，直到你重新确认。</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">WebDAV 地址<Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://dav.example.com/.../" /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">远端目录<Input value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="/SIMKeeper" /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">用户名<Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="可留空" /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">WebDAV 密码<Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">备份加密口令<Input value={passphrase} onChange={(event) => setPassphrase(event.target.value)} type="password" autoComplete="new-password" placeholder="灾难恢复口令" /></label>
      </div>

      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">{error}</div> : null}
      {notice ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-700">{notice}</div> : null}

      {inspection ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
          <div className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />备份已验证</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2"><span>版本：{inspection.summary.appVersion}</span><span>号码：{inspection.summary.counts.sim_cards ?? 0}</span><span>创建：{formatDate(inspection.summary.createdAt)}</span><span>格式：v{inspection.summary.formatVersion} / Schema v{inspection.summary.schemaVersion}</span></div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void listRemote()} disabled={Boolean(busy) || !endpoint.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white disabled:opacity-50">{busy === "list" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}读取远端备份</button>
        <button type="button" onClick={() => setOpen(false)} disabled={Boolean(busy)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 disabled:opacity-50">返回创建管理员</button>
      </div>

      {backups.length ? (
        <div className="mt-4 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {backups.map((file) => {
            const inspecting = busy === `inspect:${file.name}`;
            const restoring = busy === `restore:${file.name}`;
            return (
              <div key={file.name} className="p-3">
                <div className="break-all text-xs font-medium text-slate-700">{file.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">{formatDate(file.createdAt || file.modifiedAt)} · {formatSize(file.size)}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void inspect(file)} disabled={Boolean(busy)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-600 disabled:opacity-50">{inspecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}验证</button>
                  <button type="button" onClick={() => void restore(file)} disabled={Boolean(busy)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 px-2 text-[11px] font-medium text-white disabled:opacity-50">{restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}恢复此备份</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
