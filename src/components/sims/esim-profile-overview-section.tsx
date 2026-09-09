"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  buildLpaString,
  getEsimProfileSourceLabel,
  getEsimProfileStatusLabel,
  getEsimReusePolicyLabel,
  type EsimProfileSecrets,
  type EsimProfileSummary,
} from "@/lib/esim-profile-types";

async function copyText(value: string) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function SecretValue({ label, value, copyable = true }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const canCopy = copyable && Boolean(value) && value !== "未记录";

  async function copy() {
    if (!canCopy) return;
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="rounded-xl bg-surface-subtle px-3.5 py-3">
      <div className="text-[11px] font-medium text-ink-muted">{label}</div>
      {canCopy ? (
        <button type="button" onClick={() => void copy()} className="group mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-left text-sm font-medium text-ink-secondary transition hover:text-ink">
          <span>{value}</span>
          {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-ink-muted opacity-0 transition group-hover:opacity-100" />}
        </button>
      ) : (
        <div className="mt-1 break-all text-sm font-medium text-ink-secondary">{value || "未记录"}</div>
      )}
    </div>
  );
}

export function EsimProfileOverviewSection({
  simId,
  initialSummary,
  onEdit,
}: {
  simId: number;
  initialSummary: EsimProfileSummary | null;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<EsimProfileSummary | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [secrets, setSecrets] = useState<EsimProfileSecrets | null>(null);
  const [generatedQr, setGeneratedQr] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSummary(initialSummary);
    setSecrets(null);
    setGeneratedQr("");
    setShowOriginal(false);
  }, [simId, initialSummary]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function refreshSummary() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/esim-profiles?simId=${simId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "eSIM 配置加载失败");
        if (active) setSummary(data.profile || null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "eSIM 配置加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void refreshSummary();
    return () => { active = false; };
  }, [open, simId]);

  async function reveal() {
    setRevealing(true);
    setError("");
    try {
      const response = await fetch(`/api/esim-profiles?simId=${simId}&reveal=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "eSIM 激活信息读取失败");
      if (!data.profile) throw new Error("这张 eSIM 还没有保存激活信息");
      setSummary(data.profile);
      setSecrets(data.profile.secrets || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "eSIM 激活信息读取失败");
    } finally {
      setRevealing(false);
    }
  }

  async function generateQr() {
    const current = secrets;
    if (!current) {
      await reveal();
      return;
    }
    const lpa = current.lpaString || buildLpaString(current.smdpAddress, current.activationCode);
    if (!lpa) {
      setError("没有足够的 LPA / SM-DP+ / Activation Code 信息，无法重新生成二维码");
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(lpa, { width: 320, margin: 2, errorCorrectionLevel: "M" });
      setGeneratedQr(dataUrl);
      setShowOriginal(false);
    } catch {
      setError("二维码重新生成失败");
    }
  }

  return (
    <CollapsibleSection
      title="eSIM 配置"
      description="保存激活代码、二维码和换机资料；敏感内容默认隐藏。"
      icon={<QrCode className="h-4 w-4" />}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      badge={summary ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">已归档</span> : undefined}
      action={<Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />编辑 eSIM 配置</Button>}
      dataAttribute="esim"
    >
      {loading ? (
        <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载 eSIM 配置…</div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SecretValue label="配置状态" value={getEsimProfileStatusLabel(summary.profileStatus)} copyable={false} />
            <SecretValue label="获取来源" value={getEsimProfileSourceLabel(summary.source)} copyable={false} />
            <SecretValue label="重复激活" value={getEsimReusePolicyLabel(summary.reusePolicy)} copyable={false} />
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-ink"><ShieldCheck className="h-4 w-4 text-ink-muted" />敏感激活信息</div>
                <div className="mt-1 text-xs text-ink-muted">只有主动点击后才会从服务器解密并发送到当前浏览器。</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={secrets ? () => { setSecrets(null); setGeneratedQr(""); setShowOriginal(false); } : () => void reveal()}
                disabled={revealing}
              >
                {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : secrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {revealing ? "正在解密" : secrets ? "隐藏激活信息" : "显示激活信息"}
              </Button>
            </div>

            {secrets ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SecretValue label="SM-DP+ Address" value={secrets.smdpAddress} />
                  <SecretValue label="Activation Code" value={secrets.activationCode} />
                  <SecretValue label="Confirmation Code" value={secrets.confirmationCode} />
                  <SecretValue label="LPA 激活字符串" value={secrets.lpaString || buildLpaString(secrets.smdpAddress, secrets.activationCode)} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => void generateQr()}><RefreshCw className="h-3.5 w-3.5" />重新生成二维码</Button>
                  {secrets.originalQrDataUrl ? <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => { setShowOriginal(true); setGeneratedQr(""); }}><QrCode className="h-3.5 w-3.5" />查看原始二维码</Button> : null}
                </div>

                {(generatedQr || (showOriginal && secrets.originalQrDataUrl)) ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="text-xs font-medium text-amber-800">{generatedQr ? "根据当前 LPA 信息重新生成" : "运营商原始二维码"}</div>
                    <div className="mt-3 flex justify-center rounded-xl bg-white p-4">
                      <img src={generatedQr || secrets.originalQrDataUrl} alt="eSIM 激活二维码" className="h-auto w-full max-w-[320px]" />
                    </div>
                    <div className="mt-2 text-center text-[11px] leading-5 text-amber-700">二维码等同于 eSIM 激活凭据，请勿截图分享或在公共设备上长期显示。</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SecretValue label="SM-DP+ Address" value={summary.hasSmdpAddress ? "••••••••" : "未记录"} copyable={false} />
                <SecretValue label="Activation Code" value={summary.hasActivationCode ? "••••••••" : "未记录"} copyable={false} />
                <SecretValue label="Confirmation Code" value={summary.hasConfirmationCode ? "••••••••" : "未记录"} copyable={false} />
                <SecretValue label="原始二维码" value={summary.hasOriginalQr ? "已加密保存" : "未保存"} copyable={false} />
              </div>
            )}
          </div>

          {summary.notes ? <div className="rounded-xl bg-surface-subtle px-4 py-3"><div className="text-[11px] font-medium text-ink-muted">eSIM 配置备注</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">{summary.notes}</div></div> : null}
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-5 py-7 text-center">
          <QrCode className="mx-auto h-5 w-5 text-ink-muted" />
          <div className="mt-2 text-sm font-medium text-ink-secondary">还没有归档 eSIM 激活信息</div>
          <p className="mt-1 text-xs text-ink-muted">进入号码编辑后可以上传运营商二维码自动解析，或手动填写 SM-DP+ / Activation Code。</p>
        </div>
      )}

      {error && !summary ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    </CollapsibleSection>
  );
}
