import "server-only";

import { sqlite } from "@/db";
import { decryptCarrierConnectorCredential } from "@/lib/credential-crypto";

function parseStoredCredentials(value: string | null | undefined) {
  if (!value) return {} as Record<string, string>;
  try {
    const plaintext = decryptCarrierConnectorCredential(value);
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, item]) => [key, item]),
    );
  } catch {
    return {};
  }
}

export function getCarrierConnectorStoredCredentials(connectorId: number) {
  if (!Number.isInteger(connectorId) || connectorId <= 0) return {};
  const row = sqlite
    .prepare("SELECT credentials_encrypted FROM carrier_connectors WHERE id = ?")
    .get(connectorId) as { credentials_encrypted: string | null } | undefined;
  return parseStoredCredentials(row?.credentials_encrypted);
}

export function getCarrierConnectorStoredCredentialKeys(connectorId: number) {
  return Object.keys(getCarrierConnectorStoredCredentials(connectorId)).sort();
}
