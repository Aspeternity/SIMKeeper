"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { SiteMark } from "@/components/branding/site-mark";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_NAME_LENGTH,
  type SiteSettings,
} from "@/lib/site-settings-shared";

export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [siteName, setSiteName] = useState(initial.siteName);
  const [siteDescription, setSiteDescription] = useState(initial.siteDescription);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initial.logoUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setSelectedFile(file);
    setRemoveLogo(false);
    setError("");
    setNotice("");
  }

  function clearLogo() {
    setSelectedFile(null);
    setRemoveLogo(true);
    setError("");
    setNotice("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.set("siteName", siteName);
      formData.set("siteDescription", siteDescription);
      formData.set("logoAction", removeLogo ? "remove" : "keep");
      if (selectedFile) formData.set("logo", selectedFile);

      const response = await fetch("/api/site-settings", {
        method: "PUT",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "基础设置保存失败");

      const saved = data as SiteSettings;
      setSiteName(saved.siteName);
      setSiteDescription(saved.siteDescription);
      setCurrentLogoUrl(saved.logoUrl);
      setSelectedFile(null);
      setRemoveLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice("基础设置已保存并应用到当前站点。");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "基础设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  const visibleLogoUrl = previewUrl || (removeLogo ? null : currentLogoUrl);

  return (
    <div className="space-y-5" data-site-settings="alpha.45">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <Card className="p-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">站点信息</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">控制管理后台显示的名称，以及页面顶部和登录页使用的站点说明。</p>
          </div>

          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">网站名称</span>
              <Input
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                maxLength={MAX_SITE_NAME_LENGTH}
                placeholder="SIMKeeper"
                className="mt-2"
              />
              <span className="mt-1.5 block text-xs text-slate-400">显示在侧栏、移动端导航、登录页和浏览器标签中。</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">网站说明</span>
              <textarea
                value={siteDescription}
                onChange={(event) => setSiteDescription(event.target.value)}
                maxLength={MAX_SITE_DESCRIPTION_LENGTH}
                rows={3}
                placeholder="Self-hosted SIM & eSIM lifecycle manager"
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>留空时不显示额外说明。</span>
                <span>{siteDescription.length}/{MAX_SITE_DESCRIPTION_LENGTH}</span>
              </div>
            </label>
          </div>
        </Card>

        <Card className="p-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Logo / 站点图标</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">用于侧栏、移动端、登录页和浏览器 favicon。建议上传方形图片。</p>
          </div>

          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <SiteMark logoUrl={visibleLogoUrl} className="h-16 w-16" iconClassName="h-7 w-7" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{siteName.trim() || "SIMKeeper"}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{siteDescription || "无站点说明"}</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={chooseLogo}
              className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="text-xs leading-5 text-slate-400">支持 PNG、JPG/JPEG、WebP，最大 1 MB。图标保存在 SQLite 设置中，Docker 重建不会丢失。</p>

            {(currentLogoUrl || selectedFile) && !removeLogo ? (
              <button
                type="button"
                onClick={clearLogo}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" />移除自定义图标
              </button>
            ) : null}
            {removeLogo ? <div className="text-xs text-amber-600">保存后将恢复 SIMKeeper 默认手机图标。</div> : null}
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !siteName.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存基础设置
        </button>
      </div>
    </div>
  );
}
