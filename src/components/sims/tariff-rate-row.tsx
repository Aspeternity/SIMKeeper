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
  const editableAmount = charged || included;
  const units = charged ? getBillingUnitsForService(serviceCode) : included ? getAllowanceUnitsForService(serviceCode) : [];
  const amountLabel = included ? "包含量" : "金额";
  const unitLabel = included ? "包含单位" : "计费单位";

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
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          >
            {TARIFF_RATE_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">{amountLabel}</span>
          <div className={`flex h-10 overflow-hidden rounded-xl border bg-white ${editableAmount ? "border-slate-200" : "border-slate-100 opacity-55"}`}>
            <div className="flex min-w-[58px] items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">
              {charged ? currencyCode : included ? "数量" : "—"}
            </div>
            <input
              value={value.amount}
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              disabled={!editableAmount}
              type="number"
              min={included ? "0.000001" : "0"}
              step="any"
              inputMode="decimal"
              placeholder={charged ? "0.00" : included ? "0" : "—"}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
            />
          </div>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">{unitLabel}</span>
          <select
            value={editableAmount ? value.billingUnit : ""}
            onChange={(event) => onChange({ ...value, billingUnit: event.target.value })}
            disabled={!editableAmount}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            {!editableAmount ? <option value="">—</option> : null}
            {units.map((unit) => (
              <option key={unit.value} value={unit.value}>{unit.label}</option>
            ))}
          </select>
        </label>
      </div>

      {value.mode === "included_unlimited" ? (
        <div className="mt-2 text-xs text-emerald-700">该项目按套餐内无限量记录，不需要填写金额或数量。</div>
      ) : null}

      {value.legacyText ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          旧版资费记录：{value.legacyText}。请按上面的标准字段重新确认，保存后将使用结构化资费。
        </div>
      ) : null}
    </div>
  );
}
