"use client";

import { useMemo, useState } from "react";
import { Braces, Eye, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    <Dialog size="xl" onClose={onClose} busy={busy} dataAttribute="notification-template-editor">
      <DialogHeader
        eyebrow="消息格式"
        icon={<Braces className="h-3.5 w-3.5" />}
        title="编辑通知模板"
        description="Telegram、Bark、Gotify 和 Webhook 共用这套格式。模板与每日通知计划独立保存。"
        onClose={onClose}
        busy={busy}
      />

      <DialogBody className="space-y-5">
        {error ? <DialogAlert tone="danger">{error}</DialogAlert> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="space-y-4">
            <FormField label="通知标题模板" required>
              <Input
                value={draft.titleTemplate}
                onChange={(event) => setDraft({ ...draft, titleTemplate: event.target.value })}
                placeholder={DEFAULT_NOTIFICATION_TITLE_TEMPLATE}
              />
            </FormField>

            <FormField
              label="摘要正文模板"
              hint={<>通常保留 <code className="rounded bg-surface-subtle px-1 py-0.5 text-[11px]">{"{{items}}"}</code>，系统会把所有符合条件的提醒填进这里。</>}
            >
              <Textarea
                value={draft.bodyTemplate}
                onChange={(event) => setDraft({ ...draft, bodyTemplate: event.target.value })}
                rows={5}
              />
            </FormField>

            <FormField label="单条提醒模板" hint="用于每一条 SIM 生命周期或 Condition 提醒。">
              <Textarea
                value={draft.itemTemplate}
                onChange={(event) => setDraft({ ...draft, itemTemplate: event.target.value })}
                rows={7}
                className="font-mono text-xs"
              />
            </FormField>

            <div className="rounded-2xl border border-line bg-surface-subtle p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary"><Braces className="h-3.5 w-3.5 text-brand" />可用变量</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {NOTIFICATION_TEMPLATE_VARIABLES.map((item) => (
                  <span
                    key={item.key}
                    title={item.label}
                    className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink-secondary"
                  >
                    {`{{${item.key}}}`}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-muted">标题 / 正文常用 heading、count、date、channelName；单条提醒可使用号码、运营商、状态、到期日、requirement 和 detail 等变量。</p>
            </div>
          </div>

          <aside className="self-start rounded-2xl border border-line bg-surface-subtle p-4 xl:sticky xl:top-0" data-notification-template-preview="alpha.51.8">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary"><Eye className="h-3.5 w-3.5 text-brand" />实时预览</div>
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="text-sm font-semibold text-ink">{preview.title || "（标题为空）"}</div>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-ink-secondary">{preview.body || "（正文为空）"}</pre>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">预览使用示例号码生成。点击渠道“测试”时，会使用已经保存的模板发送真实测试消息。</p>
          </aside>
        </div>
      </DialogBody>

      <DialogFooter className="justify-between">
        <Button type="button" variant="ghost" onClick={restoreDefaults} disabled={busy}>
          <RotateCcw className="mr-2 h-4 w-4" />恢复默认
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
          <Button type="button" onClick={() => void saveTemplates()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存通知模板
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
