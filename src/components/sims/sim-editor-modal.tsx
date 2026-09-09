"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { BellRing, Loader2, Smartphone, UserRoundCheck } from "lucide-react";
import { EsimProfileEditor } from "@/components/sims/esim-profile-editor";
import {
  SimBalanceSourceEditor,
  type SimBalanceSourceEditorHandle,
} from "@/components/sims/sim-balance-source-editor";
import { Button } from "@/components/ui/button";
import { CountryRegionSelect } from "@/components/ui/country-region-select";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid, FormSection } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getDeviceTypeLabel, type DeviceRecord } from "@/lib/device-types";
import { createEmptyEsimProfileForm, type EsimProfileFormValue } from "@/lib/esim-profile-types";
import { REMINDER_STATE_CHANGED_EVENT } from "@/lib/reminders";
import {
  getDefaultCurrency,
  IDENTITY_DOCUMENT_TYPES,
  IDENTITY_STATUSES,
  SIM_STATUSES,
  SIM_TYPES,
} from "@/lib/sim-options";
import type { CarrierRecord, SimRecord } from "@/lib/sim-types";

type FormState = {
  label: string;
  phoneNumber: string;
  carrierId: string;
  deviceId: string;
  simType: string;
  iccid: string;
  balance: string;
  currencyCode: string;
  lowBalanceEnabled: boolean;
  lowBalanceThreshold: string;
  status: string;
  activationDate: string;
  validUntil: string;
  identityStatus: string;
  identityName: string;
  identityDocumentType: string;
  identityDocumentTypeCustom: string;
  identityDocumentNumber: string;
  identityCountryCode: string;
  identityNotes: string;
  notes: string;
};

type LowBalanceSourcePayload = {
  connector: {
    id: number;
    provider: string;
    syncIntervalMinutes: number;
    lastSuccessAt: string | null;
  } | null;
  latest: {
    connectorId: number | null;
    sourceProvider: string;
    balance: number | null;
  } | null;
};

function lowBalanceSourceEligible(source: LowBalanceSourcePayload | null) {
  const connector = source?.connector;
  const latest = source?.latest;
  return Boolean(
    connector
    && connector.provider !== "mock"
    && connector.syncIntervalMinutes > 0
    && connector.lastSuccessAt
    && latest
    && latest.connectorId === connector.id
    && latest.sourceProvider !== "mock"
    && latest.balance !== null
    && Number.isFinite(latest.balance),
  );
}

function getCallingCode(countryCode: string) {
  if (!countryCode) return "";
  try {
    return `+${getCountryCallingCode(countryCode as CountryCode)}`;
  } catch {
    return "";
  }
}

function toNationalNumber(phoneNumber: string | null, countryCode: string) {
  if (!phoneNumber) return "";
  try {
    const parsed = parsePhoneNumberFromString(phoneNumber, countryCode as CountryCode);
    return parsed?.nationalNumber ?? phoneNumber;
  } catch {
    return phoneNumber;
  }
}

function initialForm(carriers: CarrierRecord[], editing: SimRecord | null): FormState {
  if (editing) {
    return {
      label: editing.label,
      phoneNumber: toNationalNumber(editing.phoneNumber, editing.countryCode),
      carrierId: String(editing.carrierId),
      deviceId: editing.deviceId === null ? "" : String(editing.deviceId),
      simType: editing.simType,
      iccid: editing.iccid || "",
      balance: editing.balance === null ? "" : String(editing.balance),
      currencyCode: editing.currencyCode || getDefaultCurrency(editing.countryCode),
      lowBalanceEnabled: Boolean(editing.lowBalanceEnabled),
      lowBalanceThreshold: editing.lowBalanceThreshold === null ? "" : String(editing.lowBalanceThreshold),
      status: editing.status,
      activationDate: editing.activationDate || "",
      validUntil: editing.validUntil || "",
      identityStatus: editing.identityStatus || "unknown",
      identityName: editing.identityName || "",
      identityDocumentType: editing.identityDocumentType || "",
      identityDocumentTypeCustom: editing.identityDocumentTypeCustom || "",
      identityDocumentNumber: editing.identityDocumentNumber || "",
      identityCountryCode: editing.identityCountryCode || "",
      identityNotes: editing.identityNotes || "",
      notes: editing.notes || "",
    };
  }

  const carrier = carriers[0];
  return {
    label: "",
    phoneNumber: "",
    carrierId: carrier ? String(carrier.id) : "",
    deviceId: "",
    simType: "physical",
    iccid: "",
    balance: "",
    currencyCode: carrier ? getDefaultCurrency(carrier.countryCode) : "USD",
    lowBalanceEnabled: false,
    lowBalanceThreshold: "",
    status: "active",
    activationDate: "",
    validUntil: "",
    identityStatus: "unknown",
    identityName: "",
    identityDocumentType: "",
    identityDocumentTypeCustom: "",
    identityDocumentNumber: "",
    identityCountryCode: "",
    identityNotes: "",
    notes: "",
  };
}

function initialEsimProfile(editing: SimRecord | null): EsimProfileFormValue {
  if (!editing?.esimProfile) return createEmptyEsimProfileForm();
  return {
    profileStatus: editing.esimProfile.profileStatus,
    source: editing.esimProfile.source || "",
    reusePolicy: editing.esimProfile.reusePolicy,
    notes: editing.esimProfile.notes || "",
  };
}

export function SimEditorModal({
  carriers,
  editing,
  onClose,
  onSaved,
}: {
  carriers: CarrierRecord[];
  editing: SimRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(carriers, editing));
  const [esimProfile, setEsimProfile] = useState<EsimProfileFormValue>(() => initialEsimProfile(editing));
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [devicesError, setDevicesError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [persistedSimId, setPersistedSimId] = useState<number | null>(editing?.id ?? null);
  const [lowBalanceEligible, setLowBalanceEligible] = useState(false);
  const [lowBalanceEligibilityLoading, setLowBalanceEligibilityLoading] = useState(Boolean(editing?.id));
  const balanceSourceRef = useRef<SimBalanceSourceEditorHandle | null>(null);

  const selectedCarrier = useMemo(
    () => carriers.find((carrier) => carrier.id === Number(form.carrierId)) ?? null,
    [carriers, form.carrierId],
  );
  const callingCode = useMemo(
    () => (selectedCarrier ? getCallingCode(selectedCarrier.countryCode) : ""),
    [selectedCarrier],
  );
  const currentDeviceMissing = Boolean(
    form.deviceId
    && !devices.some((device) => device.id === Number(form.deviceId))
    && editing?.deviceId === Number(form.deviceId),
  );

  useEffect(() => {
    let active = true;

    async function loadDevices() {
      setLoadingDevices(true);
      setDevicesError("");
      try {
        const response = await fetch("/api/devices", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "设备列表加载失败");
        if (active) setDevices(data.devices || []);
      } catch (err) {
        if (active) setDevicesError(err instanceof Error ? err.message : "设备列表加载失败");
      } finally {
        if (active) setLoadingDevices(false);
      }
    }

    void loadDevices();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const simId = persistedSimId;

    async function refreshLowBalanceEligibility() {
      if (!simId) {
        if (active) {
          setLowBalanceEligible(false);
          setLowBalanceEligibilityLoading(false);
        }
        return;
      }

      setLowBalanceEligibilityLoading(true);
      try {
        const response = await fetch(`/api/sims/balance-source?simId=${simId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "余额同步状态加载失败");
        if (!active) return;

        const eligible = lowBalanceSourceEligible((data.source || null) as LowBalanceSourcePayload | null);
        setLowBalanceEligible(eligible);
        if (!eligible) {
          setForm((current) => current.lowBalanceEnabled
            ? { ...current, lowBalanceEnabled: false }
            : current);
        }
      } catch {
        if (active) setLowBalanceEligible(false);
      } finally {
        if (active) setLowBalanceEligibilityLoading(false);
      }
    }

    function handleBalanceSynced(event: Event) {
      const detail = (event as CustomEvent<{ simId?: number }>).detail;
      if (!detail?.simId || detail.simId !== simId) return;
      void refreshLowBalanceEligibility();
    }

    void refreshLowBalanceEligibility();
    window.addEventListener("simkeeper:balance-synced", handleBalanceSynced as EventListener);
    return () => {
      active = false;
      window.removeEventListener("simkeeper:balance-synced", handleBalanceSynced as EventListener);
    };
  }, [persistedSimId]);

  function changeCarrier(carrierId: string) {
    const carrier = carriers.find((item) => item.id === Number(carrierId));
    setForm((current) => ({
      ...current,
      carrierId,
      currencyCode: carrier ? getDefaultCurrency(carrier.countryCode) : current.currencyCode,
      phoneNumber: editing && Number(carrierId) !== editing.carrierId ? "" : current.phoneNumber,
    }));
  }

  function changeIdentityDocumentType(identityDocumentType: string) {
    setForm((current) => ({
      ...current,
      identityDocumentType,
      identityDocumentTypeCustom: identityDocumentType === "other" ? current.identityDocumentTypeCustom : "",
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.carrierId) {
      setError("请选择运营商");
      return;
    }
    if (form.lowBalanceEnabled && !form.lowBalanceThreshold.trim()) {
      setError("启用低余额提醒时请填写提醒阈值");
      return;
    }
    if (form.identityDocumentType === "other" && !form.identityDocumentTypeCustom.trim()) {
      setError("请输入具体证件 / 材料类型");
      return;
    }
    if (
      editing?.esimProfile
      && form.simType !== "esim"
      && !window.confirm("切换为实体 SIM 会删除这张号码已经归档的 eSIM 激活信息，确定继续吗？")
    ) {
      return;
    }

    try {
      balanceSourceRef.current?.validate();
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "自动余额同步配置不完整");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        esimProfile: form.simType === "esim" ? esimProfile : null,
      };
      const updating = persistedSimId !== null;
      const response = await fetch("/api/sims", {
        method: updating ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updating ? { id: persistedSimId, ...payload } : payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");

      const savedId = Number(data.sim?.id ?? persistedSimId);
      if (!Number.isInteger(savedId) || savedId <= 0) throw new Error("号码已保存，但没有返回有效的号码 ID");
      setPersistedSimId(savedId);

      await balanceSourceRef.current?.saveForSim(savedId);
      window.dispatchEvent(new Event(REMINDER_STATE_CHANGED_EVENT));
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} busy={saving} size="xl" dataAttribute="sim-editor">
      <DialogHeader
        eyebrow="号码管理"
        icon={<Smartphone className="h-4 w-4" />}
        title={editing ? "编辑号码" : "新增号码"}
        description="国家/地区和国际区号会根据运营商自动匹配，号码保存为统一国际格式。"
        onClose={onClose}
        busy={saving}
      />

      <form onSubmit={submit} className="contents">
        <DialogBody className="space-y-6">
          {error ? <DialogAlert>{error}</DialogAlert> : null}

          <FormSection title="基本信息" description="运营商决定国家/地区与默认币种；号码名称用于在 SIMKeeper 中快速识别。">
            <FormGrid columns={3}>
              <FormField
                label="运营商"
                required
                hint={selectedCarrier ? `${selectedCarrier.country} · ${selectedCarrier.countryCode} · 国际区号 ${callingCode || "未知"}` : undefined}
              >
                <Select value={form.carrierId} onChange={(event) => changeCarrier(event.target.value)} required autoFocus>
                  <option value="">请选择运营商</option>
                  {carriers.map((carrier) => (
                    <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="SIM 类型">
                <Select value={form.simType} onChange={(event) => setForm({ ...form, simType: event.target.value })}>
                  {SIM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </Select>
              </FormField>

              <FormField
                label="存放位置"
                hint={loadingDevices
                  ? "正在加载设备…"
                  : devicesError
                    ? `${devicesError}，当前仍可保存为未分配。`
                    : devices.length
                      ? "来自设备管理；未安装到设备上时选择“未分配”。"
                      : "暂无设备，可先保持“未分配”，之后在设备管理中添加。"}
              >
                <Select
                  value={form.deviceId}
                  onChange={(event) => setForm({ ...form, deviceId: event.target.value })}
                  disabled={loadingDevices && !form.deviceId}
                >
                  <option value="">未分配</option>
                  {currentDeviceMissing && editing?.deviceName ? (
                    <option value={form.deviceId}>{editing.deviceName} · 当前设备</option>
                  ) : null}
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>{device.name} · {getDeviceTypeLabel(device.type)}</option>
                  ))}
                </Select>
              </FormField>
            </FormGrid>

            <FormGrid>
              <FormField label="号码名称" required>
                <Input
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                  placeholder="为这张号码设置一个易识别的名称"
                  required
                />
              </FormField>
              <FormField label="手机号 / MSISDN" hint="只需输入本地号码，保存时会自动规范为 E.164 国际格式。">
                <div className="flex h-10 overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-focus">
                  <div className="flex min-w-[72px] items-center justify-center border-r border-line bg-surface-subtle px-3 font-medium text-ink-secondary">
                    {callingCode || "—"}
                  </div>
                  <input
                    value={form.phoneNumber}
                    onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                    placeholder={selectedCarrier ? "输入本地号码" : "请先选择运营商"}
                    disabled={!selectedCarrier}
                    inputMode="tel"
                    autoComplete="tel-national"
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-subtle"
                  />
                </div>
              </FormField>
            </FormGrid>

            <FormGrid className="sm:grid-cols-[1.4fr_0.6fr]">
              <FormField label="ICCID">
                <Input
                  value={form.iccid}
                  onChange={(event) => setForm({ ...form, iccid: event.target.value.replace(/\s+/g, "") })}
                  placeholder="可选，10-32 位数字"
                  inputMode="numeric"
                />
              </FormField>
              <FormField label="状态">
                <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {SIM_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </Select>
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="余额与提醒" description="余额来源可以是手动记录或运营商同步；只有可靠的周期自动同步余额才开放低余额提醒。">
            <SimBalanceSourceEditor
              ref={balanceSourceRef}
              carrier={selectedCarrier}
              editing={editing}
              balance={form.balance}
              currencyCode={form.currencyCode}
              onBalanceChange={(balance) => setForm((current) => ({ ...current, balance }))}
              onCurrencyChange={(currencyCode) => setForm((current) => ({ ...current, currencyCode }))}
              disabled={saving}
            />

            {!lowBalanceEligibilityLoading && lowBalanceEligible ? (
              <section className="rounded-xl border border-line bg-surface-subtle p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted">
                      <BellRing className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">低余额提醒</div>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-ink-muted">仅根据运营商周期自动同步的真实余额判断；余额低于或等于阈值时进入处理中心，恢复到阈值以上后自动解除。</p>
                    </div>
                  </div>
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={form.lowBalanceEnabled}
                      onChange={(event) => setForm({ ...form, lowBalanceEnabled: event.target.checked })}
                      disabled={saving}
                      className="h-4 w-4 rounded border-line-strong accent-brand"
                    />
                    启用提醒
                  </label>
                </div>

                {form.lowBalanceEnabled ? (
                  <div className="mt-4 grid gap-2 sm:max-w-md">
                    <span className="text-xs font-medium text-ink-secondary">余额低于或等于</span>
                    <div className="flex h-10 overflow-hidden rounded-lg border border-line bg-surface shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-focus">
                      <input
                        value={form.lowBalanceThreshold}
                        onChange={(event) => setForm({ ...form, lowBalanceThreshold: event.target.value })}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="例如 20"
                        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none"
                      />
                      <div className="flex min-w-20 items-center justify-center border-l border-line bg-surface-subtle px-3 text-xs font-medium text-ink-muted">
                        {form.currencyCode || "币种"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </FormSection>

          <FormSection title="生命周期" description="用于记录号码启用时间和运营商确认的有效期。">
            <FormGrid>
              <FormField label="激活日期">
                <Input value={form.activationDate} onChange={(event) => setForm({ ...form, activationDate: event.target.value })} type="date" />
              </FormField>
              <FormField label="有效期至">
                <Input value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} type="date" />
              </FormField>
            </FormGrid>
          </FormSection>

          {form.simType === "esim" ? (
            <FormSection title="eSIM Profile" description="保存这张 eSIM 的 Profile 状态、来源和重复安装策略。">
              <EsimProfileEditor
                simId={editing?.id}
                summary={editing?.esimProfile ?? null}
                value={esimProfile}
                onChange={setEsimProfile}
                disabled={saving}
              />
            </FormSection>
          ) : null}

          <FormSection
            title="实名信息"
            description="可选，用于备份号码开户 / KYC 时使用的实名主体、证件或辅助材料。属于敏感信息，请确保 SIMKeeper 实例及备份文件访问安全。"
            icon={<UserRoundCheck className="h-4 w-4" />}
          >
            <FormGrid className="sm:grid-cols-[180px_1fr]">
              <FormField label="实名状态">
                <Select value={form.identityStatus} onChange={(event) => setForm({ ...form, identityStatus: event.target.value })}>
                  {IDENTITY_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </Select>
              </FormField>
              <FormField label="实名姓名 / 主体">
                <Input
                  value={form.identityName}
                  onChange={(event) => setForm({ ...form, identityName: event.target.value })}
                  placeholder="个人姓名或企业主体名称"
                  autoComplete="off"
                />
              </FormField>
            </FormGrid>

            <FormGrid>
              <FormField label="证件 / 材料类型">
                <Select value={form.identityDocumentType} onChange={(event) => changeIdentityDocumentType(event.target.value)}>
                  <option value="">未记录</option>
                  {IDENTITY_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </Select>
              </FormField>
              <FormField label="证件 / 材料编号">
                <Input
                  value={form.identityDocumentNumber}
                  onChange={(event) => setForm({ ...form, identityDocumentNumber: event.target.value })}
                  placeholder="可选，例如证件号、账单编号或账户号"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
            </FormGrid>

            {form.identityDocumentType === "other" ? (
              <FormField
                label="具体证件 / 材料类型"
                required
                hint="选择“其他证件 / 材料”后填写，保存时会作为实际类型显示在号码详情中。"
              >
                <Input
                  value={form.identityDocumentTypeCustom}
                  onChange={(event) => setForm({ ...form, identityDocumentTypeCustom: event.target.value })}
                  placeholder="例如：港澳通行证、水电账单、地址证明"
                  autoComplete="off"
                  required
                />
              </FormField>
            ) : null}

            <FormField label="证件 / 材料国家 / 地区">
              <CountryRegionSelect
                value={form.identityCountryCode}
                onChange={(identityCountryCode) => setForm({ ...form, identityCountryCode })}
                disabled={saving}
              />
            </FormField>

            <FormField label="实名备注">
              <Textarea
                value={form.identityNotes}
                onChange={(event) => setForm({ ...form, identityNotes: event.target.value })}
                placeholder="可记录实名渠道、材料用途、证件版本、客服核验提示等"
                rows={2}
              />
            </FormField>
          </FormSection>

          <FormField label="号码备注">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="可记录套餐、用途等其他信息"
              rows={3}
            />
          </FormField>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving} className="min-w-24 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing || persistedSimId ? "保存修改" : "添加号码"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
