import "server-only";

import { cslCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/csl";
import { ditoCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/dito";
import { globeCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/globe";
import { mockCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/mock";
import type {
  CarrierConnectorProvider,
  CarrierConnectorProviderPublic,
} from "@/lib/carrier-connectors/types";

const PROVIDERS: Record<string, CarrierConnectorProvider> = {
  csl: cslCarrierConnectorProvider,
  dito: ditoCarrierConnectorProvider,
  globe: globeCarrierConnectorProvider,
  mock: mockCarrierConnectorProvider,
};

export function getCarrierConnectorProvider(id: string) {
  return PROVIDERS[id] ?? null;
}

export function listCarrierConnectorProviders(): CarrierConnectorProviderPublic[] {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    configFields: provider.configFields,
    credentialFields: provider.credentialFields,
    minLinkedSims: provider.minLinkedSims,
    maxLinkedSims: provider.maxLinkedSims,
  }));
}
