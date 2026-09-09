import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  RadioTower,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ConnectorRetryButton } from "@/components/carrier-connectors/connector-retry-button";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Card } from "@/components/ui/card";
import { listCarrierConnectorAttempts } from "@/lib/carrier-connectors/diagnostics";
import { listCarrierConnectorProviders } from "@/lib/carrier-connectors/registry";
import { listCarrierConnectors } from "@/lib/carrier-connectors/store";
import {
  CONNECTOR_CAPABILITY_LABELS,
  getConnectorHealthStatusLabel,
  getConnectorProviderMaturityLabel,
  getConnectorSyncIntervalLabel,
  type CarrierProviderErrorType,
} from "@/lib/carrier-connectors/types";

export const dynamic = "force-dynamic";

const ERROR_TYPE_LABELS: Record<CarrierProviderErrorType, string> = {
  temporary: "临时错误",
  authentication: "认证失效",
  rate_limit: "请求限流",
  maintenance: "运营商维护",
  configuration: "配置错误",
  unsupported: "接口不兼容",
  permanent: "永久错误",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function healthClass(status: string) {
  if (status === "healthy") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "syncing") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (status === "retrying" || status === "pending") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "authentication" || status === "error") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "stale") return "bg-orange-50 text-orange-700 ring-orange-100";
  return "bg-surface-subtle text-ink-secondary ring-line";
}

function maturityClass(maturity: string | undefined) {
  if (maturity === "stable") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (maturity === "beta") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

function errorSuggestion(errorType: CarrierProviderErrorType | null, healthStatus: string) {
  if (healthStatus === "stale") return "最近成功数据已经超过新鲜度窗口，建议先立即重试并检查运营商登录状态。";
  if (healthStatus === "pending") return "连接还没有成功同步过，可以立即重试完成首次数据采集。";
  if (errorType === "authentication") return "重新填写账号凭据，或按运营商要求重新完成验证码 / 登录认证。";
  if (errorType === "configuration") return "检查号码、Provider 配置和必填字段，修正后再次同步。";
  if (errorType === "unsupported") return "运营商页面或接口可能已经变化，需要检查对应 Provider 适配器。";
  if (errorType === "rate_limit") return "运营商正在限流，保留自动重试即可，避免连续手动触发。";
  if (errorType === "maintenance") return "运营商服务可能正在维护，SIMKeeper 会按策略自动重试。";
  if (errorType === "temporary") return "通常属于网络或临时服务异常，SIMKeeper 会自动重试，也可以手动再试一次。";
  if (errorType === "permanent") return "当前错误不会自动恢复，需要检查 Provider 或改回手动维护。";
  return "当前没有需要处理的同步错误。";
}

export default function CarrierConnectorsDiagnosticsPage() {
  const providers = listCarrierConnectorProviders().filter((provider) => provider.id !== "mock");
  const connectors = listCarrierConnectors();

  const healthy = connectors.filter((connector) => connector.healthStatus === "healthy").length;
  const attention = connectors.filter((connector) => ["retrying", "pending", "stale"].includes(connector.healthStatus)).length;
  const failed = connectors.filter((connector) => ["authentication", "error"].includes(connector.healthStatus)).length;

  return (
    <div
      className="space-y-7"
      data-connector-diagnostics-version="alpha.45"
      data-connector-diagnostics-polish="alpha.51.5"
    >
      <SettingsPageHeader
        icon={Activity}
        eyebrow="同步健康"
        title="运营商同步诊断"
        description="集中查看 Provider 能力、连接健康、自动重试与同步历史。只有真实可用的自动同步字段才参与对应提醒，手工维护的数据不会被误判为自动监控。"
        actions={(
          <Link
            href="/sims"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-subtle"
          >
            返回号码管理
          </Link>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="同步健康概览">
        <Card className="relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-secondary">正常连接</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{healthy}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
            最近同步成功，且数据仍在新鲜度窗口内。
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-secondary">需要关注</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{attention}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock3 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
            等待首次同步、正在自动重试，或最近数据已经过期。
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-secondary">需要处理</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{failed}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
            认证失效，或出现无法继续自动恢复的同步错误。
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <RadioTower className="h-4 w-4 text-brand" />
              Provider 支持能力
            </div>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              能力声明决定哪些字段可以由运营商自动维护；未支持的字段继续保留手动输入。
            </p>
          </div>
          <div className="text-xs text-ink-muted">当前提供 {providers.length} 个真实 Provider</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {providers.map((provider) => {
            const supportedCapabilityCount = CONNECTOR_CAPABILITY_LABELS.filter((capability) =>
              Boolean(provider.capabilities?.[capability.key]),
            ).length;

            return (
              <Card key={provider.id} className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <RadioTower className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{provider.label}</div>
                      <div className="mt-1 text-[11px] font-medium text-ink-muted">
                        支持 {supportedCapabilityCount}/{CONNECTOR_CAPABILITY_LABELS.length} 项能力
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${maturityClass(provider.maturity)}`}>
                    {getConnectorProviderMaturityLabel(provider.maturity)}
                  </span>
                </div>

                <p className="mt-4 text-xs leading-5 text-ink-secondary">{provider.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {CONNECTOR_CAPABILITY_LABELS.map((capability) => {
                    const supported = Boolean(provider.capabilities?.[capability.key]);
                    return (
                      <span
                        key={capability.key}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium ring-1 ring-inset ${supported ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-surface-subtle text-ink-muted ring-line"}`}
                      >
                        {supported ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {capability.label}
                      </span>
                    );
                  })}
                </div>

                {provider.availabilityNote ? (
                  <div className="mt-auto pt-4">
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                      {provider.availabilityNote}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-brand" />
              连接诊断
            </div>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              每个连接都显示真实调度、错误状态与最近同步尝试；“立即重试”会使用当前加密保存的凭据发起同步。
            </p>
          </div>
          <div className="text-xs text-ink-muted">共 {connectors.length} 个自动同步连接</div>
        </div>

        {!connectors.length ? (
          <Card className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm font-semibold text-ink">当前没有自动同步连接</div>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-ink-muted">
              在号码编辑中的“余额来源”选择自动同步后，这里会出现对应连接、同步健康和诊断历史。
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {connectors.map((connector) => {
              const attempts = listCarrierConnectorAttempts(connector.id, 8);
              const provider = providers.find((item) => item.id === connector.provider);

              return (
                <Card key={connector.id} className="overflow-hidden" data-connector-health={connector.healthStatus}>
                  <div className="flex flex-col gap-4 bg-surface-subtle/45 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-ink">{connector.name}</span>
                        <span className="text-xs text-ink-muted">{connector.providerLabel}</span>
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${healthClass(connector.healthStatus)}`}>
                          {getConnectorHealthStatusLabel(connector.healthStatus)}
                        </span>
                        {provider?.maturity ? (
                          <span className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${maturityClass(provider.maturity)}`}>
                            {getConnectorProviderMaturityLabel(provider.maturity)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
                        <span>{getConnectorSyncIntervalLabel(connector.syncIntervalMinutes)}</span>
                        <span>关联 {connector.linkedSims.length} 张号码</span>
                        <span>连续失败 {connector.failureCount} 次</span>
                      </div>

                      {connector.linkedSims.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {connector.linkedSims.map((sim) => (
                            <span key={sim.id} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[10px] font-medium text-ink-secondary">
                              {sim.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <ConnectorRetryButton connectorId={connector.id} />
                  </div>

                  <div className="grid border-y border-line bg-surface sm:grid-cols-2 xl:grid-cols-4">
                    <div className="border-b border-line p-4 sm:border-r xl:border-b-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">最近成功</div>
                      <div className="mt-1.5 text-xs font-medium text-ink">{formatDateTime(connector.lastSuccessAt)}</div>
                    </div>
                    <div className="border-b border-line p-4 xl:border-b-0 xl:border-r">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">最近尝试</div>
                      <div className="mt-1.5 text-xs font-medium text-ink">{formatDateTime(connector.lastAttemptAt)}</div>
                    </div>
                    <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">下次重试</div>
                      <div className="mt-1.5 text-xs font-medium text-ink">{formatDateTime(connector.nextRetryAt)}</div>
                    </div>
                    <div className="p-4">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">下次计划同步</div>
                      <div className="mt-1.5 text-xs font-medium text-ink">{formatDateTime(connector.scheduledSyncAt)}</div>
                    </div>
                  </div>

                  {(connector.lastError || connector.healthStatus === "stale" || connector.healthStatus === "pending") ? (
                    <div className="border-b border-line bg-rose-50/45 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 text-xs leading-5">
                          <div className="font-semibold text-ink">
                            {connector.lastErrorType ? ERROR_TYPE_LABELS[connector.lastErrorType] : getConnectorHealthStatusLabel(connector.healthStatus)}
                            {connector.lastErrorAt ? ` · ${formatDateTime(connector.lastErrorAt)}` : ""}
                          </div>
                          {connector.lastError ? <div className="mt-1 break-words text-rose-700">{connector.lastError}</div> : null}
                          <div className="mt-1 text-ink-secondary">建议：{errorSuggestion(connector.lastErrorType, connector.healthStatus)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" />
                        最近同步尝试
                      </div>
                      {attempts.length ? <div className="text-[10px] text-ink-muted">最近 {attempts.length} 条</div> : null}
                    </div>

                    {!attempts.length ? (
                      <div className="mt-3 rounded-xl border border-dashed border-line bg-surface-subtle/50 px-4 py-5 text-center text-xs text-ink-muted">
                        alpha.45 启用诊断历史后还没有新的同步尝试。
                      </div>
                    ) : (
                      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
                        {attempts.map((attempt, index) => (
                          <div
                            key={attempt.id}
                            className={`flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-line" : ""}`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${attempt.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                                {attempt.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-xs font-medium text-ink">{attempt.status === "success" ? "同步成功" : "同步失败"}</span>
                                  {attempt.errorType ? <span className="text-[10px] text-ink-muted">{ERROR_TYPE_LABELS[attempt.errorType]}</span> : null}
                                </div>
                                {attempt.errorMessage ? <div className="mt-0.5 truncate text-[10px] text-rose-600">{attempt.errorMessage}</div> : null}
                              </div>
                            </div>
                            <div className="shrink-0 pl-9 text-[10px] text-ink-muted sm:pl-0 sm:text-right">
                              {formatDateTime(attempt.attemptedAt)}{attempt.retryAt ? ` · 重试 ${formatDateTime(attempt.retryAt)}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
