"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import jsQR from "jsqr";
import { Eye, EyeOff, FileImage, Loader2, QrCode, ShieldCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ESIM_PROFILE_SOURCES,
  ESIM_PROFILE_STATUSES,
  ESIM_REUSE_POLICIES,
  buildLpaString,
  parseLpaString,
  type EsimProfileFormValue,
  type EsimProfileSummary,
} from "@/lib/esim-profile-types";

const MAX_QR_FILE_BYTES = 2_500_000;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("二维码图片读取失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function decodeQrFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("二维码图片无法解析"));
    });

    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法读取二维码图片");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function EsimProfileEditor({
  simId,
  summary,
  value,
  onChange,
  disabled,
}: {
  simId?: number;
  summary: EsimProfileSummary | null;
  value: EsimProfileFormValue;
  onChange: Dispatch<SetStateAction<EsimProfileFormValue>>;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [secretsVisible, setSecretsVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [uploadedOriginal, setUploadedOriginal] = useState("");
  const [keepOriginal, setKeepOriginal] = useState(Boolean(summary?.hasOriginalQr));
  const [hasOriginalQr, setHasOriginalQr] = useState(Boolean(summary?.hasOriginalQr));

  function setField<K extends keyof EsimProfileFormValue>(field: K, next: EsimProfileFormValue[K]) {
    onChange((current) => ({ ...current, [field]: next }));
  }

  function setActivationPart(field: "smdpAddress" | "activationCode", next: string) {
    onChange((current) => {
      const updated = { ...current, [field]: next, lpaString: undefined };
      const smdp = field === "smdpAddress" ? next : current.smdpAddress;
      const activation = field === "activationCode" ? next : current.activationCode;
      const rebuilt = smdp !== undefined && activation !== undefined ? buildLpaString(smdp, activation) : "";
      return rebuilt ? { ...updated, lpaString: rebuilt } : updated;
    });
  }

  function setLpaString(next: string) {
    const parsed = parseLpaString(next);
    onChange((current) => parsed
      ? { ...current, lpaString: parsed.lpaString, smdpAddress: parsed.smdpAddress, activationCode: parsed.activationCode }
      : { ...current, lpaString: next });
  }

  async function revealExisting() {
    if (!simId) return;
    setRevealing(true);
    setScanError("");
    try {
      const response = await fetch(`/api/esim-profiles?simId=${simId}&reveal=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "eSIM 激活信息读取失败");
      if (!data.profile) throw new Error("这张 eSIM 还没有保存激活信息");
      const secrets = data.profile.secrets || {};
      onChange((current) => ({
        ...current,
        smdpAddress: secrets.smdpAddress || "",
        activationCode: secrets.activationCode || "",
        confirmationCode: secrets.confirmationCode || "",
        lpaString: secrets.lpaString || "",
        originalQrDataUrl: secrets.originalQrDataUrl || undefined,
      }));
      setUploadedOriginal(secrets.originalQrDataUrl || "");
      setKeepOriginal(Boolean(secrets.originalQrDataUrl));
      setHasOriginalQr(Boolean(secrets.originalQrDataUrl));
      setSecretsVisible(true);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "eSIM 激活信息读取失败");
    } finally {
      setRevealing(false);
    }
  }

  async function handleQrFile(file: File | undefined) {
    if (!file) return;
    setScanError("");
    setScanMessage("");
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setScanError("请选择 PNG、JPEG 或 WebP 二维码图片");
      return;
    }
    if (file.size > MAX_QR_FILE_BYTES) {
      setScanError("二维码图片不能超过 2.5 MB");
      return;
    }

    setScanning(true);
    try {
      const [dataUrl, decoded] = await Promise.all([readFileAsDataUrl(file), decodeQrFile(file)]);
      setUploadedOriginal(dataUrl);
      if (keepOriginal) {
        setField("originalQrDataUrl", dataUrl);
        setHasOriginalQr(true);
      }

      if (!decoded) {
        setScanError("没有识别到二维码内容，可以换一张更清晰的原图或手动填写激活信息");
        return;
      }
      const parsed = parseLpaString(decoded);
      if (!parsed) {
        setScanError("识别到了二维码，但它不是标准 eSIM LPA 激活二维码；可以保留原图并手动填写字段");
        return;
      }

      onChange((current) => ({
        ...current,
        smdpAddress: parsed.smdpAddress,
        activationCode: parsed.activationCode,
        lpaString: parsed.lpaString,
      }));
      setSecretsVisible(true);
      setScanMessage("二维码解析成功，已自动提取 SM-DP+ Address、Activation Code 和 LPA 激活字符串。");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "二维码解析失败");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleKeepOriginal(checked: boolean) {
    setKeepOriginal(checked);
    if (checked && uploadedOriginal) {
      setField("originalQrDataUrl", uploadedOriginal);
      setHasOriginalQr(true);
    } else if (!checked) {
      setField("originalQrDataUrl", "");
      setHasOriginalQr(false);
    }
  }

  return (
    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-2">
          <QrCode className="mt-0.5 h-4 w-4 text-slate-400" />
          <div>
            <h4 className="text-sm font-medium text-slate-800">eSIM 配置</h4>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">保存运营商提供的激活二维码或代码。敏感字段会使用独立密钥 AES-256-GCM 加密后再写入 SQLite。</p>
          </div>
        </div>
        {summary ? (
          <button type="button" onClick={() => void revealExisting()} disabled={disabled || revealing} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            显示 / 编辑已保存信息
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">配置状态</span>
          <select value={value.profileStatus} onChange={(event) => setField("profileStatus", event.target.value as EsimProfileFormValue["profileStatus"])} disabled={disabled} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
            {ESIM_PROFILE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">获取来源</span>
          <select value={value.source} onChange={(event) => setField("source", event.target.value as EsimProfileFormValue["source"])} disabled={disabled} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
            <option value="">未记录</option>
            {ESIM_PROFILE_SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">重复激活</span>
          <select value={value.reusePolicy} onChange={(event) => setField("reusePolicy", event.target.value as EsimProfileFormValue["reusePolicy"])} disabled={disabled} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
            {ESIM_REUSE_POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-medium text-slate-700">上传运营商 eSIM 二维码</div>
            <div className="mt-1 text-xs text-slate-400">图片仅在当前浏览器中解析，不会上传到第三方服务。</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void handleQrFile(event.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || scanning} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileImage className="h-3.5 w-3.5" />}
              {scanning ? "正在解析" : "选择二维码图片"}
            </button>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={keepOriginal} onChange={(event) => toggleKeepOriginal(event.target.checked)} disabled={disabled} className="mt-0.5" />
          <span>同时加密保存原始二维码图片。默认不保存原图，解析出的激活信息已经足够在以后重新生成二维码。</span>
        </label>
        {hasOriginalQr ? (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
            <span>已保存原始二维码</span>
            <button type="button" onClick={() => { setField("originalQrDataUrl", ""); setKeepOriginal(false); setHasOriginalQr(false); }} disabled={disabled} className="inline-flex items-center gap-1 text-rose-600"><Trash2 className="h-3 w-3" />移除原图</button>
          </div>
        ) : null}
        {scanMessage ? <div className="mt-2 text-xs font-medium text-emerald-700">{scanMessage}</div> : null}
        {scanError ? <div className="mt-2 text-xs font-medium text-rose-600">{scanError}</div> : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">手动激活信息</div>
        <button type="button" onClick={() => setSecretsVisible((current) => !current)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
          {secretsVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {secretsVisible ? "隐藏输入内容" : "显示输入内容"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">SM-DP+ Address</span>
          <Input value={value.smdpAddress ?? ""} onChange={(event) => setActivationPart("smdpAddress", event.target.value)} type={secretsVisible ? "text" : "password"} placeholder={summary?.hasSmdpAddress && value.smdpAddress === undefined ? "已加密保存；点击上方按钮加载" : "例如 rsp.example.com"} disabled={disabled} autoComplete="off" spellCheck={false} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">Activation Code</span>
          <Input value={value.activationCode ?? ""} onChange={(event) => setActivationPart("activationCode", event.target.value)} type={secretsVisible ? "text" : "password"} placeholder={summary?.hasActivationCode && value.activationCode === undefined ? "已加密保存；点击上方按钮加载" : "运营商提供的激活码"} disabled={disabled} autoComplete="off" spellCheck={false} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">Confirmation Code</span>
          <Input value={value.confirmationCode ?? ""} onChange={(event) => setField("confirmationCode", event.target.value)} type={secretsVisible ? "text" : "password"} placeholder={summary?.hasConfirmationCode && value.confirmationCode === undefined ? "已加密保存；点击上方按钮加载" : "可选，部分运营商需要"} disabled={disabled} autoComplete="off" spellCheck={false} />
        </label>
        <label className="space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">LPA 激活字符串</span>
          <Input value={value.lpaString ?? ""} onChange={(event) => setLpaString(event.target.value)} type={secretsVisible ? "text" : "password"} placeholder={summary?.hasLpaString && value.lpaString === undefined ? "已加密保存；点击上方按钮加载" : "例如 LPA:1$SM-DP+$ActivationCode；上传标准二维码时会自动填写"} disabled={disabled} autoComplete="off" spellCheck={false} />
        </label>
      </div>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-slate-700">eSIM 配置备注</span>
        <textarea value={value.notes} onChange={(event) => setField("notes", event.target.value)} rows={2} placeholder="例如购买渠道、原订单提示、换机是否需要联系客服等" disabled={disabled} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
      </label>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
        eSIM 二维码和 Activation Code 属于高敏感凭据。数据库中会加密保存；内置可移植备份为了能够跨实例恢复，会携带恢复所需的凭据密钥，因此备份文件本身也必须妥善保管。
      </div>
    </section>
  );
}
