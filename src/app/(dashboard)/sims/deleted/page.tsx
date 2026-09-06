"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Loader2,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import type { DeletedSimRecord } from "@/lib/sim-archive-types";
import { getIdentityStatusLabel, getSimTypeLabel } from "@/lib/sim-options";

function formatDateTime(value: string) {
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

function countryFlag(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...Array.from(code).map((char) => 127397 + char.charCodeAt(0)));
}

function displayValue(value: string | null | undefined) {
  return value?.trim() || "未记录";
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function DeletedRecordModal({
  record,
  deleting,
  onClose,
  onDelete,
}: {
  record: DeletedSimRecord;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const hasIdentity = Boolean(
    record.identityStatus !== "unknown" ||
      record.identityName ||
      record.identityDocumentType ||
      record.identityCountry,
  );

  return (
    <ModalPortal onBackdropClick={deleting ? undefined : onClose}>
      <Card className="flex w-full max-w-2xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Archive className="h-4 w-4" />删除号码概要
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{record.label}</h3>
            <p className="mt-1 text-xs text-slate-400">{record.phoneNumber || "未填写手机号"} · {record.carrierName} · {record.country}</p>
          </div>
          <button onClick={onClose} disabled={deleting} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white p-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            这是删除号码时主动保留的只读概要快照。它不会继续参与保号、提醒、设备、资费或绑定服务逻辑，也不包含 eSIM 激活凭据和完整实名证件号码。
          </div>

          <section>
            <h4 className="text-sm font-semibold text-slate-800">基本身份</h4>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <InfoItem label="号码名称" value={record.label} />
              <InfoItem label="手机号" value={displayValue(record.phoneNumber)} />
              <InfoItem label="国家 / 地区" value={`${countryFlag(record.countryCode)} ${record.country} · ${record.countryCode}`} />
              <InfoItem label="运营商" value={record.carrierName} />
              <InfoItem label="SIM 类型" value={getSimTypeLabel(record.simType)} />
              <InfoItem label="ICCID" value={displayValue(record.iccid)} />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-800">删除时使用信息</h4>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <InfoItem label="激活日期" value={displayValue(record.activationDate)} />
              <InfoItem
                label="删除时余额"
                value={record.balance === null ? "未记录" : `${record.balance} ${record.currencyCode || ""}`.trim()}
              />
              <InfoItem label="删除时有效期" value={displayValue(record.validUntil)} />
              <InfoItem label="资费名称" value={displayValue(record.tariffPlanName)} />
            </div>
          </section>

          {hasIdentity ? (
            <section>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-800">实名概要</h4>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoItem label="实名状态" value={getIdentityStatusLabel(record.identityStatus)} />
                <InfoItem label="登记姓名" value={displayValue(record.identityName)} />
                <InfoItem label="证件类型" value={displayValue(record.identityDocumentType)} />
                <InfoItem
                  label="证件国家 / 地区"
                  value={record.identityCountry ? `${record.identityCountry}${record.identityCountryCode ? ` · ${record.identityCountryCode}` : ""}` : "未记录"}
                />
              </div>
            </section>
          ) : null}

          <section>
            <h4 className="text-sm font-semibold text-slate-800">绑定服务处理</h4>
            {record.bindingSummary.length ? (
              <div className="mt-3 space-y-2">
                {record.bindingSummary.map((item, index) => (
                  <div key={`${item.serviceName}-${index}`} className="rounded-xl border border-slate-200 px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-medium text-slate-800">{item.serviceName}</div>
                      {item.action === "migrate" ? (
                        <span className="w-fit rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700">迁移绑定</span>
                      ) : (
                        <span className="w-fit rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">删除绑定</span>
                      )}
                    </div>
                    {item.action === "migrate" && item.target ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>原号码</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                        <span className="font-medium text-slate-700">{item.target.label}</span>
                        <span>{item.target.phoneNumber || "未填写手机号"}</span>
                        <span>{item.target.carrierName}</span>
                      </div>
                    ) : item.action === "migrate" ? (
                      <div className="mt-2 text-xs text-slate-400">迁移目标快照不可用。</div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">删除号码时已移除这条绑定关系。</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">删除时没有仍处于“当前绑定”的服务。</div>
            )}
          </section>

          {record.notes ? (
            <section>
              <h4 className="text-sm font-semibold text-slate-800">备注</h4>
              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">{record.notes}</div>
            </section>
          ) : null}

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500">
            <CalendarDays className="h-4 w-4" />
            删除时间：{formatDateTime(record.deletedAt)}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={deleting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            永久删除记录
          </button>
          <button type="button" onClick={onClose} disabled={deleting} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">关闭</button>
        </div>
      </Card>
    </ModalPortal>
  );
}

export default function DeletedSimsPage() {
  const [records, setRecords] = useState<DeletedSimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DeletedSimRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sim-archives", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除记录加载失败");
      setRecords(data.records || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除记录加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return records;
    return records.filter((record) =>
      [
        record.label,
        record.phoneNumber || "",
        record.country,
        record.countryCode,
        record.carrierName,
        record.iccid || "",
        record.tariffPlanName || "",
        record.identityName || "",
        record.notes || "",
        ...record.bindingSummary.flatMap((item) => [
          item.serviceName,
          item.target?.label || "",
          item.target?.phoneNumber || "",
          item.target?.carrierName || "",
        ]),
      ].some((field) => field.toLowerCase().includes(value)),
    );
  }, [query, records]);

  async function deleteRecord(record: DeletedSimRecord) {
    const confirmed = window.confirm(`永久删除“${record.label}”的号码概要记录？删除后无法恢复。`);
    if (!confirmed || deletingId !== null) return;

    setDeletingId(record.id);
    setError("");
    try {
      const response = await fetch(`/api/sim-archives?id=${record.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "删除概要记录失败");
      setSelected(null);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除概要记录失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Archive className="h-4 w-4" />号码管理
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">删除记录</h2>
          <p className="mt-1 text-sm text-slate-500">查看删除号码时主动保留的只读概要快照；这些记录不会继续参与 SIMKeeper 的生命周期逻辑。</p>
        </div>
        <Link href="/sims" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />返回号码管理
        </Link>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">已保留概要</div>
            <div className="mt-1 text-xs text-slate-400">显示 {filtered.length} / {records.length} 条删除记录</div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、运营商、ICCID、实名或绑定服务" className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载删除记录…</div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Archive className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-medium">{records.length ? "没有匹配的删除记录" : "还没有保留号码概要"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{records.length ? "尝试调整搜索关键词。" : "删除号码时勾选“保留号码概要记录”，这里才会留下只读快照。"}</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelected(record)}
                className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Smartphone className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{record.label}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">已删除号码记录</span>
                      <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-inset ring-slate-100">{getSimTypeLabel(record.simType)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                      <span>{record.phoneNumber || "未填写手机号"}</span>
                      <span>{record.carrierName}</span>
                      <span>{countryFlag(record.countryCode)} {record.country}</span>
                    </div>
                    {record.iccid ? <div className="mt-1 truncate text-xs text-slate-400">ICCID {record.iccid}</div> : null}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">删除于 {formatDateTime(record.deletedAt)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <DeletedRecordModal
          record={selected}
          deleting={deletingId === selected.id}
          onClose={() => setSelected(null)}
          onDelete={() => deleteRecord(selected)}
        />
      ) : null}
    </div>
  );
}
