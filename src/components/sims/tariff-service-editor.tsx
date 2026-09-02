"use client";

import { useState } from "react";
import { ChevronDown, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
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

const selectClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";
const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

function defaultConditionValue(type: TariffRuleConditionType) {
  if (type === "network_scope") return "same_network";
  return "";
}

function hasMeaningfulBaseRate(value: TariffRateFormValue) {
  if (["free", "included_unlimited", "unavailable"].includes(value.mode)) return true;
  if (value.mode === "charged" || value.mode === "included") {
    const amount = Number(value.amount);
    return Number.isFinite(amount) && amount > 0;
  }
  return false;
}

function clearBaseRate(value: TariffRateFormValue): TariffRateFormValue {
  return { ...value, mode: "unknown", amount: "", billingUnit: "" };
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
}: {
  serviceCode: TariffServiceCode;
  value: TariffRuleConditionFormValue;
  onChange: (value: TariffRuleConditionFormValue) => void;
  onRemove: () => void;
}) {
  const service = getTariffService(serviceCode)!;
  const types = getConditionTypesForService(serviceCode);
  const destinationSpecials = service.group === "roaming"
    ? DESTINATION_SPECIAL_OPTIONS
    : DESTINATION_SPECIAL_OPTIONS.filter((item) => item.value === "OTHER");

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[140px_minmax(0,1fr)_34px] sm:items-center">
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

      <button type="button" onClick={onRemove} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="删除条件">
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

  function addCondition() {
    const type = (getConditionTypesForService(serviceCode)[0]?.value ?? "time_window") as TariffRuleConditionType;
    onChange({ ...value, conditions: [...value.conditions, { type, value: defaultConditionValue(type), value2: "" }] });
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-indigo-700">特殊规则 #{index + 1}</div>
        <button type="button" onClick={onRemove} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(160px,1fr)_150px_minmax(280px,2fr)]">
        <input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} placeholder="规则名称（可选）" className={inputClass} />
        <select
          value={value.mode}
          onChange={(event) => {
            const mode = event.target.value;
            const firstType = (getConditionTypesForService(serviceCode)[0]?.value ?? "time_window") as TariffRuleConditionType;
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
              conditions: mode === "package" ? value.conditions : value.conditions.length ? value.conditions : [{ type: firstType, value: defaultConditionValue(firstType), value2: "" }],
            });
          }}
          className={selectClass}
        >
          {TARIFF_RULE_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>

        {charged ? (
          <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <input value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 px-3 text-sm outline-none" />
            <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-500">{currencyCode}</span>
            <select value={value.billingUnit} onChange={(event) => onChange({ ...value, billingUnit: event.target.value })} className="min-w-[110px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none">
              {billingUnits.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        ) : included ? (
          <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <input value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} type="number" min="0.000001" step="any" inputMode="decimal" placeholder="包含量" className="min-w-0 flex-1 px-3 text-sm outline-none" />
            <select value={value.billingUnit} onChange={(event) => onChange({ ...value, billingUnit: event.target.value })} className="min-w-[110px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none">
              {billingUnits.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        ) : isPackage ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <input value={value.packagePrice} onChange={(event) => onChange({ ...value, packagePrice: event.target.value })} type="number" min="0" step="any" inputMode="decimal" placeholder="价格" className="min-w-0 flex-1 px-3 text-sm outline-none" />
              <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-500">{currencyCode}</span>
            </div>
            <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <input value={value.packageAllowanceAmount} onChange={(event) => onChange({ ...value, packageAllowanceAmount: event.target.value })} type="number" min="0.000001" step="any" inputMode="decimal" placeholder="包含量" className="min-w-0 flex-1 px-3 text-sm outline-none" />
              <select value={value.packageAllowanceUnit} onChange={(event) => onChange({ ...value, packageAllowanceUnit: event.target.value })} className="min-w-[76px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none">
                {allowanceUnits.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <input value={value.validityValue} onChange={(event) => onChange({ ...value, validityValue: event.target.value })} type="number" min="1" step="1" inputMode="numeric" placeholder="有效期" className="min-w-0 flex-1 px-3 text-sm outline-none" />
              <select value={value.validityUnit} onChange={(event) => onChange({ ...value, validityUnit: event.target.value })} className="min-w-[76px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none">
                <option value="">单位</option>
                {TARIFF_PERIOD_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <select value={value.autoRenew} onChange={(event) => onChange({ ...value, autoRenew: event.target.value })} className={selectClass}>
              {AUTO_RENEW_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex h-9 items-center rounded-lg border border-dashed border-slate-200 bg-white px-3 text-xs text-slate-400">无需填写金额</div>
        )}
      </div>

      <div className="mt-3 border-t border-indigo-100 pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">适用条件{isPackage ? "（可选）" : ""}</span>
          <button type="button" onClick={addCondition} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-50"><Plus className="h-3 w-3" />添加条件</button>
        </div>
        {value.conditions.length ? (
          <div className="space-y-2">
            {value.conditions.map((condition, conditionIndex) => (
              <ConditionEditor
                key={`${conditionIndex}-${condition.type}`}
                serviceCode={serviceCode}
                value={condition}
                onChange={(next) => onChange({ ...value, conditions: value.conditions.map((item, itemIndex) => itemIndex === conditionIndex ? next : item) })}
                onRemove={() => {
                  if (!isPackage && value.conditions.length === 1) return;
                  onChange({ ...value, conditions: value.conditions.filter((_, itemIndex) => itemIndex !== conditionIndex) });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-indigo-100 bg-white/60 px-3 py-2 text-xs text-slate-400">无条件：作为该项目的普遍可选通行证。</div>
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
  const hasBaseRate = hasMeaningfulBaseRate(baseRate);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [baseRateOpen, setBaseRateOpen] = useState(rules.length === 0 || hasBaseRate);

  function updateRules(nextRules: TariffConditionalRuleFormValue[]) {
    if (nextRules.length > 0 && !hasMeaningfulBaseRate(baseRate) && baseRate.mode !== "unknown") {
      onBaseRateChange(clearBaseRate(baseRate));
    }
    onRulesChange(nextRules);
  }

  function addRule() {
    updateRules([...rules, createEmptyConditionalRule(serviceCode)]);
    setAdvancedOpen(true);
    if (!hasBaseRate) setBaseRateOpen(false);
  }

  function removeBaseRate() {
    onBaseRateChange(clearBaseRate(baseRate));
    setBaseRateOpen(false);
  }

  const conditionalOnly = rules.length > 0 && !hasBaseRate && !baseRateOpen;

  return (
    <div className="space-y-2">
      {conditionalOnly ? (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{label}</span>
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">按条件计费</span>
            <span className="text-[11px] text-slate-400">{rules.length} 条规则</span>
          </div>
          <button type="button" onClick={() => setBaseRateOpen(true)} className="text-xs font-medium text-slate-500 transition hover:text-slate-800">设置基础资费</button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <TariffRateRow serviceCode={serviceCode} label={rules.length ? `${label} · 基础资费` : label} currencyCode={currencyCode} value={baseRate} onChange={onBaseRateChange} />
          {rules.length && baseRateOpen ? (
            <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
              <span>基础资费用于未命中特殊规则时的默认收费；没有统一基础资费可以留空。</span>
              <button type="button" onClick={removeBaseRate} className="shrink-0 font-medium text-slate-500 transition hover:text-slate-800">不设置基础资费</button>
            </div>
          ) : null}
        </div>
      )}

      {rules.length ? (
        <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          特殊规则 ({rules.length})
          <ChevronDown className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <button type="button" onClick={addRule} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-indigo-700">
          <Plus className="h-3.5 w-3.5" />添加特殊规则
        </button>
      )}

      {advancedOpen && rules.length ? (
        <div className="space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
          <p className="text-xs leading-5 text-slate-400">以下规则用于同网/异网、分地区、分时段等差异化计费。相同类型条件按“或”，不同类型条件按“且”。</p>
          {rules.map((rule, index) => (
            <ConditionalRuleEditor
              key={index}
              serviceCode={serviceCode}
              currencyCode={currencyCode}
              index={index}
              value={rule}
              onChange={(next) => updateRules(rules.map((item, itemIndex) => itemIndex === index ? next : item))}
              onRemove={() => updateRules(rules.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
          <button type="button" onClick={addRule} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-indigo-200 px-2.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50">
            <Plus className="h-3.5 w-3.5" />再添加一条规则
          </button>
        </div>
      ) : null}
    </div>
  );
}
