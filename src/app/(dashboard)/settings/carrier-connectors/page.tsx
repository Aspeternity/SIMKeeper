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
  return "bg-slate-100 text-slate-600 ring-slate-200";
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
    <div className="mx-auto max-w-7xl space-y-6" data-connector-diagnostics-version="alpha.45">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Activity className="h-4 w-4" />同步健康
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">运营商同步诊断</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Provider 能力、成熟度、同步健康与自动重试集中在这里。手工余额不会因为存在实验性 Provider 而被误判为可自动监控。
          </p>
        </div>
        <Link href="/sims" className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          返回号码管理
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between"><span className="text-sm text-slate-500">正常连接</span><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{healthy}</div>
          <div className="mt-1 text-xs text-slate-400">最近同步成功且数据仍在新鲜度窗口</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><span className="text-sm text-slate-500">需要关注</span><Clock3 className="h-4 w-4 text-amber-600" /></div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{attention}</div>
          <div className="mt-1 text-xs text-slate-400">等待首次同步、自动重试或数据已经过期</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><span className="text-sm text-slate-500">需要处理</span><AlertTriangle className="h-4 w-4 text-rose-600" /></div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{failed}</div>
          <div className="mt-1 text-xs text-slate-400">认证失效或不可自动恢复的同步错误</div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Provider 支持能力</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">能力声明决定哪些自动化功能可以启用；不支持的字段继续由用户手动维护。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <RadioTower className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-slate-900">{provider.label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{provider.description}</p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ring-1 ${maturityClass(provider.maturity)}`}>
                  {getConnectorProviderMaturityLabel(provider.maturity)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {CONNECTOR_CAPABILITY_LABELS.map((capability) => {
                  const supported = Boolean(provider.capabilities?.[capability.key]);
                  return (
                    <span
                      key={capability.key}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ring-1 ${supported ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-50 text-slate-400 ring-slate-100"}`}
                    >
                      {supported ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {capability.label}
                    </span>
                  );
                })}
              </div>

              {provider.availabilityNote ? (
                <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                  {provider.availabilityNote}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">连接诊断</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">每个连接显示真实调度和错误状态；“立即重试”会使用当前已加密保存的凭据发起一次同步。</p>
        </div>

        {!connectors.length ? (
          <Card className="p-8 text-center">
            <DatabaseZap className="mx-auto h-8 w-8 text-slate-300" />
            <div className="mt-3 text-sm font-medium text-slate-700">当前没有自动同步连接</div>
            <p className="mt-1 text-xs text-slate-400">在号码编辑中的“余额来源”选择自动同步后，这里会出现对应诊断信息。</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {connectors.map((connector) => {
              const attempts = listCarrierConnectorAttempts(connector.id, 8);
              const provider = providers.find((item) => item.id === connector.provider);
              return (
                <Card key={connector.id} className="overflow-hidden">
                  <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{connector.name}</span>
                        <span className="text-xs text-slate-400">{connector.providerLabel}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ${healthClass(connector.healthStatus)}`}>
                          {getConnectorHealthStatusLabel(connector.healthStatus)}
                        </span>
                        {provider?.maturity ? (
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ${maturityClass(provider.maturity)}`}>
                            {getConnectorProviderMaturityLabel(provider.maturity)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{getConnectorSyncIntervalLabel(connector.syncIntervalMinutes)}</span>
                        <span>关联 {connector.linkedSims.length} 张号码</span>
                        <span>连续失败 {connector.failureCount} 次</span>
                      </div>
                      {connector.linkedSims.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {connector.linkedSims.map((sim) => (
                            <span key={sim.id} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{sim.label}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <ConnectorRetryButton connectorId={connector.id} />
                  </div>

                  <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="bg-white p-4"><div className="text-[10px] text-slate-400">最近成功</div><div className="mt-1 text-xs font-medium text-slate-700">{formatDateTime(connector.lastSuccessAt)}</div></div>
                    <div className="bg-white p-4"><div className="text-[10px] text-slate-400">最近尝试</div><div className="mt-1 text-xs font-medium text-slate-700">{formatDateTime(connector.lastAttemptAt)}</div></div>
                    <div className="bg-white p-4"><div className="text-[10px] text-slate-400">下次重试</div><div className="mt-1 text-xs font-medium text-slate-700">{formatDateTime(connector.nextRetryAt)}</div></div>
                    <div className="bg-white p-4"><div className="text-[10px] text-slate-400">下次计划同步</div><div className="mt-1 text-xs font-medium text-slate-700">{formatDateTime(connector.scheduledSyncAt)}</div></div>
                  </div>

                  {(connector.lastError || connector.healthStatus === "stale" || connector.healthStatus === "pending") ? (
                    <div className="border-t bg-rose-50/40 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                        <div className="min-w-0 text-xs leading-5">
                          <div className="font-medium text-slate-700">
                            {connector.lastErrorType ? ERROR_TYPE_LABELS[connector.lastErrorType] : getConnectorHealthStatusLabel(connector.healthStatus)}
                            {connector.lastErrorAt ? ` · ${formatDateTime(connector.lastErrorAt)}` : ""}
                          </div>
                          {connector.lastError ? <div className="mt-1 break-words text-rose-700">{connector.lastError}</div> : null}
                          <div className="mt-1 text-slate-500">建议：{errorSuggestion(connector.lastErrorType, connector.healthStatus)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t px-5 py-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700"><ShieldCheck className="h-3.5 w-3.5 text-slate-400" />最近同步尝试</div>
                    {!attempts.length ? (
                      <div className="mt-3 text-xs text-slate-400">alpha.45 启用诊断历史后还没有新的同步尝试。</div>
                    ) : (
                      <div className="mt-3 divide-y rounded-xl border">
                        {attempts.map((attempt) => (
                          <div key={attempt.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              {attempt.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                              <span className="text-xs font-medium text-slate-700">{attempt.status === "success" ? "同步成功" : "同步失败"}</span>
                              {attempt.errorType ? <span className="text-[10px] text-slate-400">{ERROR_TYPE_LABELS[attempt.errorType]}</span> : null}
                              {attempt.errorMessage ? <span className="truncate text-[10px] text-rose-600">{attempt.errorMessage}</span> : null}
                            </div>
                            <div className="shrink-0 text-[10px] text-slate-400">
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
