import "server-only";

import { cslCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/csl";
import { ditoCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/dito";
import { globeCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/globe";
import { mockCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/mock";
import { voxiCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/voxi-browser-otp-safe";
import type {
  CarrierConnectorCapabilities,
  CarrierConnectorProvider,
  CarrierConnectorProviderMaturity,
  CarrierConnectorProviderPublic,
} from "@/lib/carrier-connectors/types";

type ProviderMetadata = {
  maturity: CarrierConnectorProviderMaturity;
  availabilityNote?: string;
  capabilities: CarrierConnectorCapabilities;
};

const PROVIDER_METADATA: Record<string, ProviderMetadata> = {
  csl: {
    maturity: "stable",
    capabilities: {
      automaticSync: true,
      balance: true,
      balanceValidity: false,
      simValidity: true,
      accountStatus: true,
      multiSim: false,
    },
  },
  dito: {
    maturity: "stable",
    capabilities: {
      automaticSync: true,
      balance: true,
      balanceValidity: true,
      simValidity: false,
      accountStatus: true,
      multiSim: false,
    },
  },
  globe: {
    maturity: "experimental",
    availabilityNote: "GlobeOne 自动同步仍依赖管理员自行提供受授权的运行时认证；未配置时应继续使用手动余额，不会启用自动低余额判断。",
    capabilities: {
      automaticSync: true,
      balance: true,
      balanceValidity: true,
      simValidity: false,
      accountStatus: true,
      multiSim: false,
    },
  },
  voxi: {
    maturity: "experimental",
    availabilityNote: "VOXI 没有公开的第三方消费者余额 API。当前实现使用 SIMKeeper 服务器内置 Playwright Chromium 打开 VOXI 官方网页并维持持久化浏览器 Profile，再通过短信 OTP 建立登录状态并读取 /subscription/get 的 simBalance。",
    capabilities: {
      automaticSync: true,
      balance: true,
      balanceValidity: false,
      simValidity: false,
      accountStatus: true,
      multiSim: false,
    },
  },
  mock: {
    maturity: "stable",
    availabilityNote: "仅用于离线测试同步、重试、快照与恢复流程。",
    capabilities: {
      automaticSync: true,
      balance: true,
      balanceValidity: true,
      simValidity: false,
      accountStatus: true,
      multiSim: true,
    },
  },
};

function withMetadata(provider: CarrierConnectorProvider): CarrierConnectorProvider {
  const metadata = PROVIDER_METADATA[provider.id];
  if (!metadata) return provider;
  return {
    ...provider,
    maturity: provider.maturity ?? metadata.maturity,
    availabilityNote: provider.availabilityNote ?? metadata.availabilityNote,
    capabilities: provider.capabilities ?? metadata.capabilities,
  };
}

const PROVIDERS: Record<string, CarrierConnectorProvider> = {
  csl: withMetadata(cslCarrierConnectorProvider),
  dito: withMetadata(ditoCarrierConnectorProvider),
  globe: withMetadata(globeCarrierConnectorProvider),
  voxi: withMetadata(voxiCarrierConnectorProvider),
  mock: withMetadata(mockCarrierConnectorProvider),
};

export function getCarrierConnectorProvider(id: string) {
  return PROVIDERS[id] ?? null;
}

export function listCarrierConnectorProviders(): CarrierConnectorProviderPublic[] {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    maturity: provider.maturity,
    availabilityNote: provider.availabilityNote,
    capabilities: provider.capabilities,
    configFields: provider.configFields,
    credentialFields: provider.credentialFields,
    minLinkedSims: provider.minLinkedSims,
    maxLinkedSims: provider.maxLinkedSims,
  }));
}
