import "server-only";

import { mockCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/mock";
import type {
  CarrierConnectorProvider,
  CarrierConnectorProviderPublic,
} from "@/lib/carrier-connectors/types";

const PROVIDERS: Record<string, CarrierConnectorProvider> = {
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
    credentialFields: provider.credentialFields,
  }));
}
