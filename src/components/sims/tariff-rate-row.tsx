"use client";

import { getBillingUnitsForService, TARIFF_RATE_MODES, type TariffServiceCode } from "@/lib/tariff-options";

export type TariffRateFormValue = {
  mode: string;
  amount: string;
  billingUnit: string;
  legacyText: string;
};

export function TariffRateRow({
  serviceCode,
  label,
  currencyCode,
  value,
  onChange,
}: {
  serviceCode: TariffServiceCode;
  label: string;
  currencyCode: string;
  value: TariffRateFormValue;
  onChange: (value: TariffRateFormValue) => void;
}) {
  const units = getBillingUnitsForService(serviceCode);
  const charged = value.mode === "charged";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(120px,1fr)_150px_170px_160px] md:items-end">
        <div>
          <div className="text-xs text-slate-400">项目</div>
          <div className="mt-1.5 h-10 content-center text-sm font-medium text-slate-800">{label}</div>
        </div>

        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">状态</span>
          <select
            value={value.mode}
            onChange={(event) => {
              const mode = event.target.value;
              onChange({
                ...value,
                mode,
                amount: mode === "charged" ? value.amount : "",
                billingUnit: mode === "charged" ? (value.billingUnit || units[0]?.value || "") : value.billingUnit,
              });
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          >
            {TARIFF_RATE_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">金额</span>
          <div className={`flex h-10 overflow-hidden rounded-xl border bg-white ${charged ? "border-slate-200" : "border-slate-100 opacity-55"}`}>
            <div className="flex min-w-[58px] items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">
              {currencyCode}
            </div>
            <input
              value={value.amount}
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              disabled={!charged}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder={charged ? "0.00" : "—"}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
            />
          </div>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">计费单位</span>
          <select
            value={value.billingUnit}
            onChange={(event) => onChange({ ...value, billingUnit: event.target.value })}
            disabled={!charged}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            {units.map((unit) => (
              <option key={unit.value} value={unit.value}>{unit.label}</option>
            ))}
          </select>
        </label>
      </div>

      {value.legacyText ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          旧版资费记录：{value.legacyText}。请按上面的标准字段重新确认，保存后将使用结构化资费。
        </div>
      ) : null}
    </div>
  );
}
