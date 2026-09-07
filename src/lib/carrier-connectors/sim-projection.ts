import "server-only";

import { sqlite } from "@/db";

type RawSimValidity = {
  valid_until: string | null;
};

function validateIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Provider 返回了无效 SIM 卡有效期");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("Provider 返回了无效 SIM 卡有效期");
  }
}

/**
 * Project an operator-authoritative SIM expiry into the SIM card record.
 *
 * Providers should call this only when the remote field is explicitly the
 * SIM/card expiry itself. Missing remote values never clear a manually stored
 * validity date.
 */
export function projectCarrierReportedSimValidity(simId: number, validUntil: string | null | undefined) {
  if (!validUntil) return { changed: false, previousValidUntil: null, validUntil: null };
  validateIsoDate(validUntil);

  const current = sqlite
    .prepare("SELECT valid_until FROM sim_cards WHERE id = ?")
    .get(simId) as RawSimValidity | undefined;
  if (!current) throw new Error("关联 SIM 已不存在");

  if (current.valid_until === validUntil) {
    return {
      changed: false,
      previousValidUntil: current.valid_until,
      validUntil,
    };
  }

  sqlite
    .prepare("UPDATE sim_cards SET valid_until = ?, updated_at = ? WHERE id = ?")
    .run(validUntil, new Date().toISOString(), simId);

  return {
    changed: true,
    previousValidUntil: current.valid_until,
    validUntil,
  };
}
