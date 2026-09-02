"use client";

import {
  getAllowanceUnitsForService,
  getBillingUnitsForService,
  getTariffService,
  TARIFF_RATE_MODES,
  type TariffServiceCode,
} from "@/lib/tariff-options";

export type TariffRateFormValue = {
  mode: string;
  amount: string;
  billingUnit: string;
  legacyText: string;
};

const selectClass = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

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
  const service = getTariffService(serviceCode)!;
  const charged = value.mode === "charged";
  const included = value.mode === "included";
  const units = charged ? getBillingUnitsForService(serviceCode) : included ? getAllowanceUnitsForService(serviceCode) : [];

  function changeMode(mode: string) {
    const nextCharged = mode === "charged";
    const nextIncluded = mode === "included";
    onChange({
      ...value,
      mode,
      amount: nextCharged || nextIncluded ? value.amount : "",
      billingUnit: nextCharged
        ? service.defaultUnit
        : nextIncluded
          ? service.defaultAllowanceUnit
          : "",
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="grid gap-2.5 md:grid-cols-[minmax(130px,1fr)_140px_minmax(260px,360px)] md:items-center">
        <div className="text-sm font-medium text-slate-800">{label}</div>

        <select value={value.mode} onChange={(event) => changeMode(event.target.value)} className={`${selectClass} w-full`}>
          {TARIFF_RATE_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
        </select>

        {charged ? (
          <div className="flex h-9 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
            <input
              value={value.amount}
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300"
            />
            <div className="flex items-center border-l border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-500">{currencyCode}</div>
            <select
              value={value.billingUnit}
              onChange={(event) => onChange({ ...value, billingUnit: event.target.value })}
              className="min-w-[108px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none"
            >
              {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </div>
        ) : included ? (
          <div className="flex h-9 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
            <input
              value={value.amount}
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              type="number"
              min="0.000001"
              step="any"
              inputMode="decimal"
              placeholder="包含量"
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300"
            />
            <select
              value={value.billingUnit}
              onChange={(event) => onChange({ ...value, billingUnit: event.target.value })}
              className="min-w-[110px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none"
            >
              {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex h-9 items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">
            {value.mode === "free" ? "免费，无需填写金额" : value.mode === "included_unlimited" ? "套餐内无限" : value.mode === "unavailable" ? "不可用" : "未记录具体资费"}
          </div>
        )}
      </div>

      {value.legacyText ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          旧版资费记录：{value.legacyText}。请按标准字段重新确认，保存后将使用结构化资费。
        </div>
      ) : null}
    </div>
  );
}
