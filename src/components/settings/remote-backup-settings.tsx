"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
  CloudUpload,
  History,
  KeyRound,
  Loader2,
  Play,
  Save,
  ServerCog,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type RemoteBackupConfig = {
  provider: "webdav";
  enabled: boolean;
  endpoint: string;
  remotePath: string;
  username: string;
  scheduleFrequency: "daily" | "weekly";
  scheduleWeekday: number;
  scheduleHour: number;
  scheduleMinute: number;
  scheduleTimezone: string;
  retentionMode: "count" | "smart";
  retentionCount: number;
  notifyFailures: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastScheduledSuccessAt: string | null;
  lastError: string | null;
  lastRemoteName: string | null;
  lastRemoteSize: number | null;
  lastRemoteDigest: string | null;
  lastRetentionWarning: string | null;
  nextRunAt: string | null;
  nextRetryAt: string | null;
  consecutiveFailures: number;
  pausedReason: "auth" | "permission" | null;
  failureEpisodeStartedAt: string | null;
  passwordConfigured: boolean;
  passphraseConfigured: boolean;
  restorePaused: boolean;
  restorePausedAt: string | null;
  instanceId: string;
  instanceShortId: string;
};

type RemoteBackupRun = {
  id: number;
  trigger: "manual" | "scheduled";
  status: "running" | "success" | "failed";
  startedAt: string;
  completedAt: string | null;
  localBackupName: string | null;
  remoteName: string | null;
  size: number | null;
  error: string | null;
};

type RemoteBackupResponse = {
  config: RemoteBackupConfig;
  runs: RemoteBackupRun[];
};

const weekdayOptions = [
  { value: 0, label: "星期日" },
  { value: 1, label: "星期一" },
  { value: 2, label: "星期二" },
  { value: 3, label: "星期三" },
  { value: 4, label: "星期四" },
  { value: 5, label: "星期五" },
  { value: 6, label: "星期六" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
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
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function runStatusLabel(status: RemoteBackupRun["status"]) {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return "进行中";
}

export default function RemoteBackupSettings() {
  const [config, setConfig] = useState<RemoteBackupConfig | null>(null);
  const [runs, setRuns] = useState<RemoteBackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [remotePath, setRemotePath] = useState("/SIMKeeper");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<"daily" | "weekly">("daily");
  const [scheduleWeekday, setScheduleWeekday] = useState(0);
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Shanghai");
  const [retentionMode, setRetentionMode] = useState<"count" | "smart">("smart");
  const [retentionCount, setRetentionCount] = useState("14");
  const [notifyFailures, setNotifyFailures] = useState(true);

  const applyConfig = useCallback((value: RemoteBackupConfig) => {
    setConfig(value);
    setEnabled(value.enabled);
    setEndpoint(value.endpoint);
    setRemotePath(value.remotePath);
    setUsername(value.username);
    setScheduleFrequency(value.scheduleFrequency);
    setScheduleWeekday(value.scheduleWeekday);
    setScheduleTime(`${pad(value.scheduleHour)}:${pad(value.scheduleMinute)}`);
    setScheduleTimezone(value.scheduleTimezone);
    setRetentionMode(value.retentionMode);
    setRetentionCount(String(value.retentionCount));
    setNotifyFailures(value.notifyFailures);
    setPassword("");
    setBackupPassphrase("");
    setBackupPassphraseConfirm("");
  }, []);

  const loadData = useCallback(async (resetDraft = false) => {
    setLoading(true);
    try {
      const response = await fetch("/api/remote-backups", { cache: "no-store" });
      const data = await response.json() as Partial<RemoteBackupResponse> & { error?: string };
      if (!response.ok || !data.config) throw new Error(data.error || "异地备份状态加载失败");
      setConfig(data.config);
      setRuns(data.runs || []);
      if (resetDraft) applyConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "异地备份状态加载失败");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/remote-backups", { cache: "no-store" });
        const data = await response.json() as Partial<RemoteBackupResponse> & { error?: string };
        if (!response.ok || !data.config) throw new Error(data.error || "异地备份状态加载失败");
        applyConfig(data.config);
        setRuns(data.runs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "异地备份状态加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [applyConfig]);

  const targetChanged = useMemo(() => Boolean(
    config && (endpoint.trim() !== config.endpoint || username.trim() !== config.username),
  ), [config, endpoint, username]);

  const savedReady = Boolean(
    config?.endpoint
    && config.passphraseConfigured
    && (!config.username || config.passwordConfigured),
  );

  function parseScheduleTime() {
    const match = scheduleTime.match(/^(\d{2}):(\d{2})$/);
    if (!match) throw new Error("请选择有效的自动备份时间");
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("自动备份时间不正确");
    return { hour, minute };
  }

  async function saveConfig() {
    setError("");
    setNotice("");
    if (backupPassphrase && Array.from(backupPassphrase).length < 8) {
      setError("自动异地备份口令至少需要 8 个字符。");
      return;
    }
    if (backupPassphrase && backupPassphrase !== backupPassphraseConfirm) {
      setError("两次输入的自动异地备份口令不一致。");
      return;
    }

    let time: { hour: number; minute: number };
    try {
      time = parseScheduleTime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "自动备份时间不正确");
      return;
    }

    setBusy("save");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          endpoint,
          remotePath,
          username,
          password: password || undefined,
          backupPassphrase: backupPassphrase || undefined,
          scheduleFrequency,
          scheduleWeekday,
          scheduleHour: time.hour,
          scheduleMinute: time.minute,
          scheduleTimezone,
          retentionMode,
          retentionCount: Number(retentionCount),
          notifyFailures,
        }),
      });
      const data = await response.json() as { config?: RemoteBackupConfig; error?: string };
      if (!response.ok || !data.config) throw new Error(data.error || "异地备份设置保存失败");
      applyConfig(data.config);
      setNotice(data.config.enabled
        ? "自动异地备份设置已保存；调度器已按新的持久化计划生效。"
        : "异地备份设置已保存；自动调度当前关闭。",
      );
      await loadData(false);
      window.dispatchEvent(new Event("simkeeper:reminder-state-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "异地备份设置保存失败");
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    setError("");
    setNotice("");
    setBusy("test");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          endpoint,
          remotePath,
          username,
          password: password || undefined,
        }),
      });
      const data = await response.json() as { remotePath?: string; atomicMove?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "WebDAV 连接测试失败");
      setNotice(`WebDAV 读写与 MOVE 原子提交测试通过，测试文件已从 ${data.remotePath || remotePath} 清理。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebDAV 连接测试失败");
    } finally {
      setBusy("");
    }
  }

  async function runNow() {
    setError("");
    setNotice("");
    setBusy("run");
    try {
      const response = await fetch("/api/remote-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await response.json() as {
        result?: { remoteName: string; size: number; digest: string; retentionWarning: string | null };
        error?: string;
      };
      if (!response.ok || !data.result) throw new Error(data.error || "异地备份失败");
      setNotice(
        data.result.retentionWarning
          ? `备份已经原子提交并回读校验通过；旧备份清理需要检查：${data.result.retentionWarning}`
          : `备份已经原子提交并回读校验通过：${data.result.remoteName}（${formatSize(data.result.size)}）`,
      );
      await loadData(false);
      window.dispatchEvent(new Event("simkeeper:reminder-state-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "异地备份失败");
      await loadData(false);
      window.dispatchEvent(new Event("simkeeper:reminder-state-changed"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div id="remote-backup" className="mx-auto max-w-7xl space-y-4 scroll-mt-28">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-slate-900">
              <CloudUpload className="h-4 w-4 text-slate-400" />自动异地备份
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              alpha.50 使用一次 SQLite 一致性快照同时生成本地和远端备份；远端先写入 .uploading 临时对象，回读 SHA-256 校验后通过 WebDAV MOVE 原子提交，最终文件再次校验成功才记为完成。
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            启用自动备份
          </label>
        </div>

        {config?.restorePaused ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            <div className="font-medium">恢复后的自动调度已安全暂停</div>
            <div className="mt-1 text-xs leading-5 text-amber-700">恢复时间：{formatDate(config.restorePausedAt)}。这是为了防止原实例和恢复实例同时清理同一个 WebDAV 目录。请先测试连接，再勾选“启用自动备份”并保存以明确接管。</div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">WebDAV 地址</label>
            <Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://dav.example.com/remote.php/dav/files/user/" className="mt-1" />
            <div className="mt-1 text-[11px] leading-5 text-slate-400">需要支持 MKCOL / PUT / GET / PROPFIND / DELETE / MOVE。不要把凭据写进 URL。</div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">远端目录</label>
            <Input value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="/SIMKeeper" className="mt-1" />
            <div className="mt-1 text-[11px] leading-5 text-slate-400">目录不存在时会逐级创建；不同实例可共用目录，但只会自动清理自己的备份。</div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">用户名</label>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="可留空用于匿名 WebDAV" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">WebDAV 密码</label>
            <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={config?.passwordConfigured && !targetChanged ? "已保存；留空保持不变" : "输入 WebDAV 密码"} className="mt-1" />
            {targetChanged && config?.passwordConfigured && !password ? <div className="mt-1 text-[11px] leading-5 text-amber-600">地址或用户名已改变；保存前请重新输入 WebDAV 密码。</div> : null}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200"><KeyRound className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">自动备份加密口令</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">无人值守任务需要取得口令，因此它会被本机 data/.credential-secret 再加密保存。WebDAV 只收到 AES-256-GCM 加密的 .simkeeper-backup。</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={backupPassphrase} onChange={(event) => setBackupPassphrase(event.target.value)} type="password" autoComplete="new-password" placeholder={config?.passphraseConfigured ? "已保存；留空保持不变" : "至少 8 个字符"} />
                <Input value={backupPassphraseConfirm} onChange={(event) => setBackupPassphraseConfirm(event.target.value)} type="password" autoComplete="new-password" placeholder="仅设置新口令时再次输入" />
              </div>
              <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />灾难恢复必须使用你另外保存的口令，不能只依赖 SIMKeeper 主机上的副本。</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="text-xs font-medium text-slate-600">执行周期</label>
            <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value === "weekly" ? "weekly" : "daily")} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"><option value="daily">每天</option><option value="weekly">每周</option></select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">星期</label>
            <select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))} disabled={scheduleFrequency !== "weekly"} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none disabled:bg-slate-50 disabled:text-slate-300">{weekdayOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">执行时间</label><Input value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} type="time" className="mt-1" /></div>
          <div><label className="text-xs font-medium text-slate-600">时区</label><Input value={scheduleTimezone} onChange={(event) => setScheduleTimezone(event.target.value)} placeholder="Asia/Shanghai" className="mt-1" /></div>
          <div>
            <label className="text-xs font-medium text-slate-600">保留策略</label>
            <select value={retentionMode} onChange={(event) => setRetentionMode(event.target.value === "count" ? "count" : "smart")} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"><option value="smart">智能保留</option><option value="count">最近 N 份</option></select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">最近 N 份</label><Input value={retentionCount} onChange={(event) => setRetentionCount(event.target.value)} type="number" min="1" max="100" disabled={retentionMode !== "count"} className="mt-1 disabled:bg-slate-50 disabled:text-slate-300" /></div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-slate-400">智能保留：最近 7 个日桶 + 4 个周桶 + 6 个月桶；同一份文件可以同时满足多个桶，因此实际文件数通常少于 17。alpha.48/49 已保存的配置升级后会继续沿用“最近 N 份”，不会偷偷改变清理策略。</div>

        <label className="mt-4 inline-flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-600">
          <input type="checkbox" checked={notifyFailures} onChange={(event) => setNotifyFailures(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span><span className="font-medium text-slate-700">通过已启用的通知渠道发送备份故障/恢复通知</span><br />首次失败、连续失败、WebDAV 凭据/权限阻塞及恢复正常时发送；同一故障阶段会去重。</span>
        </label>

        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveConfig()} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存配置</button>
          <button type="button" onClick={() => void testConnection()} disabled={Boolean(busy) || !endpoint.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}测试连接与原子提交</button>
          <button type="button" onClick={() => void runNow()} disabled={Boolean(busy) || !savedReady} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}立即异地备份</button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-medium text-slate-900"><ServerCog className="h-4 w-4 text-slate-400" />运行状态</div>
          {loading && !config ? <div className="mt-4 flex items-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载…</div> : config ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className={config.enabled ? "rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700" : "rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-500"}>{config.enabled ? "自动调度已启用" : "自动调度已关闭"}</span>
                <span className={config.pausedReason ? "rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-700" : "rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700"}>{config.pausedReason === "auth" ? "凭据阻塞" : config.pausedReason === "permission" ? "权限阻塞" : "调度未阻塞"}</span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">实例 {config.instanceShortId}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-400">最近成功</div><div className="mt-1 text-sm font-medium text-slate-700">{formatDate(config.lastSuccessAt)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-400">下一次计划</div><div className="mt-1 text-sm font-medium text-slate-700">{formatDate(config.nextRunAt)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-400">下一次重试</div><div className="mt-1 text-sm font-medium text-slate-700">{formatDate(config.nextRetryAt)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-400">连续失败</div><div className="mt-1 text-sm font-medium text-slate-700">{config.consecutiveFailures} 次</div></div>
              </div>
              {config.lastRemoteName ? <div className="rounded-xl border border-slate-100 px-3 py-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0"><div className="text-xs font-medium text-slate-700">最近已验证远端备份</div><div className="mt-1 break-all text-[11px] leading-5 text-slate-400">{config.lastRemoteName} · {formatSize(config.lastRemoteSize)}</div>{config.lastRemoteDigest ? <div className="mt-1 break-all font-mono text-[10px] text-slate-300">SHA-256 {config.lastRemoteDigest}</div> : null}</div></div></div> : null}
              {config.lastRetentionWarning ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-700">远端保留清理：{config.lastRetentionWarning}</div> : null}
              {config.lastError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">最近错误：{config.lastError}</div> : null}
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b p-5 font-medium text-slate-900"><History className="h-4 w-4 text-slate-400" />最近异地备份记录</div>
          {loading && runs.length === 0 ? <div className="flex min-h-40 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载…</div> : runs.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center text-center text-sm text-slate-400"><CloudCog className="mb-2 h-5 w-5 text-slate-300" />还没有异地备份执行记录</div> : (
            <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
              {runs.map((run) => <div key={run.id} className="p-4"><div className="flex flex-wrap items-center gap-2">{run.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : run.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}<span className="text-xs font-medium text-slate-700">{runStatusLabel(run.status)}</span><span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">{run.trigger === "scheduled" ? "自动" : "手动"}</span><span className="text-[11px] text-slate-400">{formatDate(run.startedAt)}</span></div>{run.remoteName ? <div className="mt-1.5 break-all text-[11px] leading-5 text-slate-400">{run.remoteName} · {formatSize(run.size)}</div> : null}{run.error ? <div className="mt-1.5 text-[11px] leading-5 text-rose-600">{run.error}</div> : null}</div>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
