import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { globeOneRuntimeAuthStatus } from "@/lib/carrier-connectors/providers/globe-transport";
import { listCarrierConnectorProviders } from "@/lib/carrier-connectors/registry";
import {
  createCarrierConnector,
  deleteCarrierConnector,
  getCarrierConnector,
  getSimSyncSummary,
  rescheduleCarrierConnectorScheduler,
  syncCarrierConnector,
  updateCarrierConnector,
} from "@/lib/carrier-connectors/store";
import { CONNECTOR_SYNC_INTERVAL_OPTIONS } from "@/lib/carrier-connectors/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedIntervals = new Set<number>(
  CONNECTOR_SYNC_INTERVAL_OPTIONS.map((item) => item.value),
);

const providerMatchers: Record<string, {
  supportedCountryCodes: string[];
  carrierNameKeywords: string[];
}> = {
  csl: {
    supportedCountryCodes: ["HK"],
    carrierNameKeywords: ["csl", "one2free", "pccw"],
  },
  dito: {
    supportedCountryCodes: ["PH"],
    carrierNameKeywords: ["dito"],
  },
  globe: {
    supportedCountryCodes: ["PH"],
    carrierNameKeywords: ["globe", "tm", "touch mobile"],
  },
};

const configureSchema = z.object({
  simId: z.coerce.number().int().positive("无效的号码 ID"),
  provider: z.string().trim().min(1, "请选择自动同步来源").max(80),
  syncIntervalMinutes: z.coerce
    .number()
    .int()
    .refine((value) => allowedIntervals.has(value), "不支持的自动同步间隔"),
  providerConfig: z.record(z.string(), z.unknown()).optional().default({}),
  credentials: z.record(z.string(), z.string().max(16000, "连接凭据内容过长")).optional(),
});

const syncSchema = z.object({
  simId: z.coerce.number().int().positive("无效的号码 ID"),
});

type SimCarrierRow = {
  id: number;
  label: string;
  carrier_name: string;
  country_code: string;
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

function positiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function providerRuntimeState(providerId: string) {
  if (providerId !== "globe") {
    return {
      maturity: "stable" as const,
      availabilityNote: null as string | null,
      runtimeReady: true,
      runtimeMessage: null as string | null,
      runtimeWarning: null as string | null,
      runtimeMode: null as "oauth" | "static-token" | null,
      runtimeSource: null as string | null,
      runtimeExpiresAt: null as string | null,
    };
  }
  const state = globeOneRuntimeAuthStatus();
  const availabilityNote = "GlobeOne 当前没有面向第三方自托管应用的公开消费者余额认证入口。SIMKeeper 不内置 GlobeOne App 的内部凭据；仅在管理员自行提供受授权的运行时认证后开放自动同步。";
  return {
    maturity: "experimental" as const,
    availabilityNote,
    runtimeReady: state.configured,
    runtimeMessage: state.configured ? state.message : availabilityNote,
    runtimeWarning: state.warning,
    runtimeMode: state.mode,
    runtimeSource: state.source,
    runtimeExpiresAt: state.expiresAt,
  };
}

function listBalanceProviders() {
  return listCarrierConnectorProviders()
    .map((provider) => {
      const matcher = providerMatchers[provider.id];
      if (!matcher) return null;
      const runtimeState = providerRuntimeState(provider.id);
      return {
        ...provider,
        description: provider.id === "globe"
          ? `实验性集成。${provider.description}`
          : provider.description,
        ...matcher,
        ...runtimeState,
      };
    })
    .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));
}

function getSimCarrier(simId: number) {
  return sqlite
    .prepare(
      `SELECT s.id, s.label, c.name AS carrier_name, c.country_code
       FROM sim_cards s
       JOIN carriers c ON c.id = s.carrier_id
       WHERE s.id = ?`,
    )
    .get(simId) as SimCarrierRow | undefined;
}

function providerSupportsSim(
  provider: ReturnType<typeof listBalanceProviders>[number],
  sim: SimCarrierRow,
) {
  const country = sim.country_code.toUpperCase();
  const carrierName = sim.carrier_name.toLowerCase();
  const countryMatches = provider.supportedCountryCodes.length === 0
    || provider.supportedCountryCodes.some((code) => code.toUpperCase() === country);
  const carrierMatches = provider.carrierNameKeywords.length === 0
    || provider.carrierNameKeywords.some((keyword) => carrierName.includes(keyword.toLowerCase()));
  return countryMatches && carrierMatches;
}

function currentConnectorForSim(simId: number) {
  const summary = getSimSyncSummary(simId);
  if (!summary.connector) return null;
  return getCarrierConnector(summary.connector.id);
}

function sourcePayload(simId: number) {
  const summary = getSimSyncSummary(simId);
  const connector = summary.connector ? getCarrierConnector(summary.connector.id) : null;
  return {
    connector: connector
      ? {
          id: connector.id,
          provider: connector.provider,
          providerLabel: connector.providerLabel,
          status: connector.status,
          healthStatus: connector.healthStatus,
          syncIntervalMinutes: connector.syncIntervalMinutes,
          hasCredentials: connector.hasCredentials,
          lastSyncedAt: connector.lastSyncedAt,
          lastAttemptAt: connector.lastAttemptAt,
          lastSuccessAt: connector.lastSuccessAt,
          dataUpdatedAt: connector.dataUpdatedAt,
          lastError: connector.lastError,
          lastErrorType: connector.lastErrorType,
          lastErrorAt: connector.lastErrorAt,
          failureCount: connector.failureCount,
          retryAt: connector.retryAt,
          retryAttempt: connector.retryAttempt,
          nextRetryAt: connector.nextRetryAt,
          retryCount: connector.retryCount,
          scheduledSyncAt: connector.scheduledSyncAt,
          nextSyncAt: connector.nextSyncAt,
          stale: connector.stale,
        }
      : null,
    latest: summary.latest,
    stale: summary.stale,
    sourceDeleted: summary.sourceDeleted,
  };
}

function normalizeProviderConfig(
  provider: ReturnType<typeof listBalanceProviders>[number],
  input: Record<string, unknown>,
) {
  const result: Record<string, unknown> = {};
  for (const field of provider.configFields ?? []) {
    const value = input[field.key];
    if (field.required && (value === null || value === undefined || value === "")) {
      throw new Error(`请填写${field.label}`);
    }
    if (value !== undefined) result[field.key] = value;
  }
  return result;
}

function normalizeCredentials(
  provider: ReturnType<typeof listBalanceProviders>[number],
  input: Record<string, string> | undefined,
) {
  const allowedKeys = new Set(provider.credentialFields.map((field) => field.key));
  return Object.fromEntries(
    Object.entries(input ?? {})
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([key, value]) => allowedKeys.has(key) && Boolean(value)),
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const providers = listBalanceProviders();
  const rawSimId = request.nextUrl.searchParams.get("simId");
  if (rawSimId === null) {
    return NextResponse.json({
      providers,
      syncIntervals: CONNECTOR_SYNC_INTERVAL_OPTIONS,
    });
  }

  const simId = positiveId(rawSimId);
  if (!simId) return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  if (!getSimCarrier(simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  return NextResponse.json({
    providers,
    syncIntervals: CONNECTOR_SYNC_INTERVAL_OPTIONS,
    source: sourcePayload(simId),
  });
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = configureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  const sim = getSimCarrier(parsed.data.simId);
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const provider = listBalanceProviders().find((item) => item.id === parsed.data.provider);
  if (!provider) {
    return NextResponse.json({ error: "当前版本不支持这个运营商的自动余额同步" }, { status: 400 });
  }
  if (!providerSupportsSim(provider, sim)) {
    return NextResponse.json({ error: `${provider.label} 与当前号码的运营商不匹配` }, { status: 400 });
  }

  try {
    const current = currentConnectorForSim(sim.id);
    const sameProvider = Boolean(current && current.provider === provider.id);
    const providerConfig = normalizeProviderConfig(provider, parsed.data.providerConfig);
    const credentials = normalizeCredentials(provider, parsed.data.credentials);
    const canReuseCredentials = Boolean(sameProvider && current?.hasCredentials);

    for (const field of provider.credentialFields) {
      if (field.required && !canReuseCredentials && !credentials[field.key]) {
        throw new Error(`请填写${field.label}`);
      }
    }

    if (provider.minLinkedSims !== undefined && provider.minLinkedSims > 1) {
      throw new Error(`${provider.label} 暂不支持在号码编辑器中按单卡配置`);
    }

    if (current && !sameProvider) {
      await deleteCarrierConnector(current.id);
    }

    const mutation = {
      name: `${sim.label} · ${provider.label}`.slice(0, 100),
      provider: provider.id,
      syncIntervalMinutes: parsed.data.syncIntervalMinutes,
      simIds: [sim.id],
      providerConfig,
      credentials: Object.keys(credentials).length ? credentials : undefined,
      clearCredentials: false,
    };

    if (current && sameProvider) {
      updateCarrierConnector(current.id, mutation);
    } else {
      createCarrierConnector(mutation);
    }

    rescheduleCarrierConnectorScheduler();
    return NextResponse.json({ source: sourcePayload(sim.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自动余额同步配置失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const simId = positiveId(request.nextUrl.searchParams.get("simId"));
  if (!simId) return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  if (!getSimCarrier(simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  try {
    const current = currentConnectorForSim(simId);
    if (current) await deleteCarrierConnector(current.id);
    rescheduleCarrierConnectorScheduler();
    return NextResponse.json({ ok: true, source: sourcePayload(simId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "关闭自动余额同步失败" },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  const current = currentConnectorForSim(parsed.data.simId);
  if (!current) {
    return NextResponse.json({ error: "这张号码尚未启用自动余额同步" }, { status: 409 });
  }

  try {
    const result = await syncCarrierConnector(current.id);
    const source = sourcePayload(parsed.data.simId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.errors[0]?.error || "余额同步失败", result, source },
        { status: 502 },
      );
    }
    return NextResponse.json({ result, source });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "余额同步失败" },
      { status: 500 },
    );
  }
}
