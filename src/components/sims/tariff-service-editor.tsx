"use client";

import { Plus, Trash2 } from "lucide-react";
import { TariffRateRow, type TariffRateFormValue } from "@/components/sims/tariff-rate-row";
import { COUNTRY_REGIONS } from "@/lib/countries";
import {
  AUTO_RENEW_OPTIONS,
  DESTINATION_SPECIAL_OPTIONS,
  getAllowanceUnitsForService,
  getBillingUnitsForService,
  getConditionTypesForService,
  getTariffService,
  NETWORK_SCOPE_OPTIONS,
  TARIFF_PERIOD_UNITS,
  TARIFF_RULE_MODES,
  type TariffRuleConditionType,
  type TariffServiceCode,
} from "@/lib/tariff-options";

export type TariffRuleConditionFormValue = {
  type: TariffRuleConditionType;
  value: string;
  value2: string;
};

export type TariffConditionalRuleFormValue = {
  label: string;
  mode: string;
  amount: string;
  billingUnit: string;
  packagePrice: string;
  packageAllowanceAmount: string;
  packageAllowanceUnit: string;
  validityValue: string;
  validityUnit: string;
  autoRenew: string;
  conditions: TariffRuleConditionFormValue[];
};

const selectClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

function defaultConditionValue(type: TariffRuleConditionType) {
  if (type === "network_scope") return "same_network";
  return "";
}

export function createEmptyConditionalRule(serviceCode: TariffServiceCode): TariffConditionalRuleFormValue {
  const service = getTariffService(serviceCode)!;
  const conditionType = (getConditionTypesForService(serviceCode)[0]?.value ?? "time_window") as TariffRuleConditionType;
  return {
    label: "",
    mode: "charged",
    amount: "",
    billingUnit: service.defaultUnit,
    packagePrice: "",
    packageAllowanceAmount: "",
    packageAllowanceUnit: service.defaultAllowanceUnit,
    validityValue: "",
    validityUnit: "",
    autoRenew: "unknown",
    conditions: [{ type: conditionType, value: defaultConditionValue(conditionType), value2: "" }],
  };
}

function ConditionEditor({
  serviceCode,
  value,
  onChange,
  onRemove,
  removable,
}: {
  serviceCode: TariffServiceCode;
  value: TariffRuleConditionFormValue;
  onChange: (value: TariffRuleConditionFormValue) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const service = getTariffService(serviceCode)!;
  const types = getConditionTypesForService(serviceCode);
  const destinationSpecials = service.group === "roaming"
    ? DESTINATION_SPECIAL_OPTIONS
    : DESTINATION_SPECIAL_OPTIONS.filter((item) => item.value === "OTHER");

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:grid-cols-[150px_minmax(0,1fr)_36px] sm:items-center">
      <select
        value={value.type}
        onChange={(event) => {
          const type = event.target.value as TariffRuleConditionType;
          onChange({ type, value: defaultConditionValue(type), value2: "" });
        }}
        className={selectClass}
      >
        {types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>

      {value.type === "network_scope" ? (
        <select value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} className={selectClass}>
          {NETWORK_SCOPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      ) : value.type === "destination" ? (
        <select value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} className={selectClass}>
          <option value="">请选择目的地</option>
          <optgroup label="快捷范围">
            {destinationSpecials.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </optgroup>
          <optgroup label="国家 / 地区">
            {COUNTRY_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}
          </optgroup>
        </select>
      ) : value.type === "roaming_region" ? (
        <select value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} className={selectClass}>
          <option value="">请选择漫游地区</option>
          <option value="OTHER">其他国家 / 地区</option>
          {COUNTRY_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}
        </select>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input type="time" value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} className={inputClass} />
          <span className="text-xs text-slate-400">至</span>
          <input type="time" value={value.value2} onChange={(event) => onChange({ ...value, value2: event.target.value })} className={inputClass} />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={!removable}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-25"
        title="删除条件"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ConditionalRuleEditor({
  serviceCode,
  currencyCode,
  index,
  value,
  onChange,
  onRemove,
}: {
  serviceCode: TariffServiceCode;
  currencyCode: string;
  index: number;
  value: TariffConditionalRuleFormValue;
  onChange: (value: TariffConditionalRuleFormValue) => void;
  onRemove: () => void;
}) {
  const service = getTariffService(serviceCode)!;
  const charged = value.mode === "charged";
  const included = value.mode === "included";
  const isPackage = value.mode === "package";
  const billingUnits = charged ? getBillingUnitsForService(serviceCode) : included ? getAllowanceUnitsForService(serviceCode) : [];
  const allowanceUnits = getAllowanceUnitsForService(serviceCode);

  function updateCondition(conditionIndex: number, condition: TariffRuleConditionFormValue) {
    onChange({
      ...value,
      conditions: value.conditions.map((item, itemIndex) => itemIndex === conditionIndex ? condition : item),
    });
  }

  function addCondition() {
    const type = (getConditionTypesForService(serviceCode)[0]?.value ?? "time_window") as TariffRuleConditionType;
    onChange({
      ...value,
      conditions: [...value.conditions, { type, value: defaultConditionValue(type), value2: "" }],
    });
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-indigo-700">条件资费 #{index + 1}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">相同条件类型按“任一”匹配，不同条件类型需要同时满足。</div>
        </div>
        <button type="button" onClick={onRemove} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-rose-600 transition hover:bg-rose-50">
          <Trash2 className="h-3.5 w-3.5" />删除规则
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {value.conditions.map((condition, conditionIndex) => (
          <ConditionEditor
            key={`${conditionIndex}-${condition.type}`}
            serviceCode={serviceCode}
            value={condition}
            onChange={(next) => updateCondition(conditionIndex, next)}
            onRemove={() => onChange({ ...value, conditions: value.conditions.filter((_, itemIndex) => itemIndex !== conditionIndex) })}
            removable={value.conditions.length > 1}
          />
        ))}
        <button type="button" onClick={addCondition} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50">
          <Plus className="h-3.5 w-3.5" />添加条件
        </button>
      </div>

      <div className="mt-3 grid gap-3 border-t border-indigo-100 pt-3 md:grid-cols-[minmax(140px,1fr)_170px_minmax(0,2fr)]">
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">规则名称</span>
          <input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} placeholder={isPackage ? "可选，如 2GB 漫游通行证" : "可选"} className={inputClass} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-slate-400">资费类型</span>
          <select
            value={value.mode}
            onChange={(event) => {
              const mode = event.target.value;
              onChange({
                ...value,
                mode,
                amount: "",
                billingUnit: mode === "charged" ? service.defaultUnit : mode === "included" ? service.defaultAllowanceUnit : "",
                packagePrice: "",
                packageAllowanceAmount: "",
                packageAllowanceUnit: service.defaultAllowanceUnit,
                validityValue: "",
                validityUnit: "",
                autoRenew: "unknown",
              });
            }}
            className={selectClass}
          >
            {TARIFF_RULE_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        {charged || included ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">{charged ? "金额" : "包含量"}</span>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex min-w-[58px] items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">{charged ? currencyCode : "数量"}</div>
                <input
                  value={value.amount}
                  onChange={(event) => onChange({ ...value, amount: event.target.value })}
                  type="number"
                  min={included ? "0.000001" : "0"}
                  step="any"
                  inputMode="decimal"
                  placeholder={charged ? "0.00" : "0"}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">{charged ? "计费单位" : "包含单位"}</span>
              <select value={value.billingUnit} onChange={(event) => onChange({ ...value, billingUnit: event.target.value })} className={selectClass}>
                {billingUnits.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        ) : isPackage ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">价格</span>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex min-w-[58px] items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">{currencyCode}</div>
                <input value={value.packagePrice} onChange={(event) => onChange({ ...value, packagePrice: event.target.value })} type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">包含量</span>
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <input value={value.packageAllowanceAmount} onChange={(event) => onChange({ ...value, packageAllowanceAmount: event.target.value })} type="number" min="0.000001" step="any" inputMode="decimal" placeholder="0" className={inputClass} />
                <select value={value.packageAllowanceUnit} onChange={(event) => onChange({ ...value, packageAllowanceUnit: event.target.value })} className={selectClass}>
                  {allowanceUnits.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">有效期</span>
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <input value={value.validityValue} onChange={(event) => onChange({ ...value, validityValue: event.target.value })} type="number" min="1" step="1" inputMode="numeric" placeholder="可选" className={inputClass} />
                <select value={value.validityUnit} onChange={(event) => onChange({ ...value, validityUnit: event.target.value })} className={selectClass}>
                  <option value="">单位</option>
                  {TARIFF_PERIOD_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-slate-400">续订方式</span>
              <select value={value.autoRenew} onChange={(event) => onChange({ ...value, autoRenew: event.target.value })} className={selectClass}>
                {AUTO_RENEW_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <div className="flex h-10 items-center rounded-xl border border-dashed border-slate-200 px-3 text-xs text-slate-400">
            该资费类型不需要填写金额或数量。
          </div>
        )}
      </div>
    </div>
  );
}

export function TariffServiceEditor({
  serviceCode,
  label,
  currencyCode,
  baseRate,
  rules,
  onBaseRateChange,
  onRulesChange,
}: {
  serviceCode: TariffServiceCode;
  label: string;
  currencyCode: string;
  baseRate: TariffRateFormValue;
  rules: TariffConditionalRuleFormValue[];
  onBaseRateChange: (value: TariffRateFormValue) => void;
  onRulesChange: (value: TariffConditionalRuleFormValue[]) => void;
}) {
  return (
    <div className="space-y-2.5">
      <TariffRateRow serviceCode={serviceCode} label={`${label} · 默认`} currencyCode={currencyCode} value={baseRate} onChange={onBaseRateChange} />

      {rules.map((rule, index) => (
        <ConditionalRuleEditor
          key={index}
          serviceCode={serviceCode}
          currencyCode={currencyCode}
          index={index}
          value={rule}
          onChange={(next) => onRulesChange(rules.map((item, itemIndex) => itemIndex === index ? next : item))}
          onRemove={() => onRulesChange(rules.filter((_, itemIndex) => itemIndex !== index))}
        />
      ))}

      <button
        type="button"
        onClick={() => onRulesChange([...rules, createEmptyConditionalRule(serviceCode)])}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-indigo-200 px-3 text-xs font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
      >
        <Plus className="h-3.5 w-3.5" />
        添加条件资费
      </button>
    </div>
  );
}
