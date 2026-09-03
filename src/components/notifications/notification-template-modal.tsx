"use client";

import { useMemo, useState } from "react";
import { Braces, Loader2, RotateCcw, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  DEFAULT_NOTIFICATION_ITEM_TEMPLATE,
  DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
  NOTIFICATION_TEMPLATE_VARIABLES,
  renderNotificationTemplate,
} from "@/lib/notification-templates";

export type NotificationTemplates = {
  titleTemplate: string;
  bodyTemplate: string;
  itemTemplate: string;
};

type NotificationTemplateModalProps = {
  templates: NotificationTemplates;
  onClose: () => void;
  onSaved: (templates: NotificationTemplates) => void;
};

function buildPreview(templates: NotificationTemplates) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const shared = { app: "SIMKeeper", heading: "今日提醒", count: 1, date, channelName: "Telegram" };
  const item = renderNotificationTemplate(templates.itemTemplate, {
    ...shared,
    index: 1,
    simLabel: "Globe菲律宾",
    phoneNumber: "+63 912 345 6789",
    carrierName: "Globe",
    country: "菲律宾",
    title: "号码有效期 · 充值至少 PHP 20",
    kind: "号码有效期",
    status: "即将到期",
    relative: "还有 7 天",
    dueDate: "2027-08-30",
    dueSuffix: " · 2027-08-30",
    requirement: "充值至少 PHP 20",
    detail: "号码有效期将在 2027-08-30 到期 · 操作要求：充值至少 PHP 20",
  });

  return {
    title: renderNotificationTemplate(templates.titleTemplate, shared),
    body: renderNotificationTemplate(templates.bodyTemplate, { ...shared, items: item }),
  };
}

export function NotificationTemplateModal({ templates, onClose, onSaved }: NotificationTemplateModalProps) {
  const [draft, setDraft] = useState<NotificationTemplates>(templates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => buildPreview(draft), [draft]);

  function restoreDefaults() {
    setDraft({
      titleTemplate: DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_NOTIFICATION_BODY_TEMPLATE,
      itemTemplate: DEFAULT_NOTIFICATION_ITEM_TEMPLATE,
    });
    setError("");
  }

  async function saveTemplates() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "templates", templates: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知模板保存失败");
      const saved = data.settings as NotificationTemplates | undefined;
      onSaved(saved ? {
        titleTemplate: saved.titleTemplate,
        bodyTemplate: saved.bodyTemplate,
        itemTemplate: saved.itemTemplate,
      } : draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知模板保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onBackdropClick={() => !busy && onClose()}>
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><Braces className="h-3.5 w-3.5" />消息格式</div>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">编辑通知模板</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Telegram、Bark、Gotify 和 Webhook 共用这套格式。模板与每日通知计划独立保存。</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
          {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <label className="grid gap-2 text-sm text-slate-600">
                通知标题模板
                <Input value={draft.titleTemplate} onChange={(event) => setDraft({ ...draft, titleTemplate: event.target.value })} placeholder={DEFAULT_NOTIFICATION_TITLE_TEMPLATE} />
              </label>

              <label className="grid gap-2 text-sm text-slate-600">
                摘要正文模板
                <textarea value={draft.bodyTemplate} onChange={(event) => setDraft({ ...draft, bodyTemplate: event.target.value })} rows={5} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400" />
                <span className="text-xs text-slate-400">通常保留 <code>{"{{items}}"}</code>，系统会把所有符合条件的提醒填进这里。</span>
              </label>

              <label className="grid gap-2 text-sm text-slate-600">
                单条提醒模板
                <textarea value={draft.itemTemplate} onChange={(event) => setDraft({ ...draft, itemTemplate: event.target.value })} rows={6} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-6 text-slate-700 outline-none transition focus:border-slate-400" />
              </label>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-medium text-slate-500">可用变量</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {NOTIFICATION_TEMPLATE_VARIABLES.map((item) => (
                    <span key={item.key} title={item.label} className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500 ring-1 ring-inset ring-slate-100">{`{{${item.key}}}`}</span>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">标题 / 正文常用 heading、count、date、channelName；单条提醒可使用号码、运营商、状态、到期日、requirement 和 detail 等变量。</p>
              </div>
            </div>

            <div className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:sticky xl:top-0">
              <div className="text-xs font-medium text-slate-500">实时预览</div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{preview.title || "（标题为空）"}</div>
                <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-slate-600">{preview.body || "（正文为空）"}</pre>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-400">预览使用示例号码生成。点击渠道“测试”时，会使用已经保存的模板发送真实测试消息。</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={restoreDefaults} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />恢复默认</button>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => !busy && onClose()} className="h-10 rounded-xl border px-4 text-sm text-slate-500 transition hover:bg-slate-50">取消</button>
            <button type="button" onClick={() => void saveTemplates()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存通知模板</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
