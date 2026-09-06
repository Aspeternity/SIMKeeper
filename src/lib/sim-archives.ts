import "server-only";

import { sqlite } from "@/db";
import type { DeletedSimBindingSummary, DeletedSimRecord } from "@/lib/sim-archive-types";

export type CreateSimArchiveInput = Omit<DeletedSimRecord, "id">;

type DeletedSimRow = {
  id: number;
  original_sim_id: number;
  label: string;
  phone_number: string | null;
  country: string;
  country_code: string;
  carrier_name: string;
  sim_type: string;
  iccid: string | null;
  balance: number | null;
  currency_code: string | null;
  activation_date: string | null;
  valid_until: string | null;
  tariff_plan_name: string | null;
  identity_status: string;
  identity_name: string | null;
  identity_document_type: string | null;
  identity_country: string | null;
  identity_country_code: string | null;
  notes: string | null;
  binding_summary: string;
  deleted_at: string;
};

export function ensureSimArchiveTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sim_deleted_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_sim_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      phone_number TEXT,
      country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      carrier_name TEXT NOT NULL,
      sim_type TEXT NOT NULL,
      iccid TEXT,
      balance REAL,
      currency_code TEXT,
      activation_date TEXT,
      valid_until TEXT,
      tariff_plan_name TEXT,
      identity_status TEXT NOT NULL DEFAULT 'unknown',
      identity_name TEXT,
      identity_document_type TEXT,
      identity_country TEXT,
      identity_country_code TEXT,
      notes TEXT,
      binding_summary TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sim_deleted_records_deleted_at ON sim_deleted_records(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_sim_deleted_records_phone_number ON sim_deleted_records(phone_number);
  `);
}

function parseBindingSummary(value: string): DeletedSimBindingSummary[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Record<string, unknown>;
      if (typeof raw.serviceName !== "string" || (raw.action !== "migrate" && raw.action !== "delete")) return [];
      if (raw.action === "delete") {
        return [{ serviceName: raw.serviceName, action: "delete" as const }];
      }

      const target = raw.target;
      if (!target || typeof target !== "object") {
        return [{ serviceName: raw.serviceName, action: "migrate" as const, target: null }];
      }
      const targetRecord = target as Record<string, unknown>;
      if (typeof targetRecord.label !== "string" || typeof targetRecord.carrierName !== "string") {
        return [{ serviceName: raw.serviceName, action: "migrate" as const, target: null }];
      }
      return [
        {
          serviceName: raw.serviceName,
          action: "migrate" as const,
          target: {
            label: targetRecord.label,
            phoneNumber: typeof targetRecord.phoneNumber === "string" ? targetRecord.phoneNumber : null,
            carrierName: targetRecord.carrierName,
          },
        },
      ];
    });
  } catch {
    return [];
  }
}

function mapRow(row: DeletedSimRow): DeletedSimRecord {
  return {
    id: row.id,
    originalSimId: row.original_sim_id,
    label: row.label,
    phoneNumber: row.phone_number,
    country: row.country,
    countryCode: row.country_code,
    carrierName: row.carrier_name,
    simType: row.sim_type,
    iccid: row.iccid,
    balance: row.balance,
    currencyCode: row.currency_code,
    activationDate: row.activation_date,
    validUntil: row.valid_until,
    tariffPlanName: row.tariff_plan_name,
    identityStatus: row.identity_status,
    identityName: row.identity_name,
    identityDocumentType: row.identity_document_type,
    identityCountry: row.identity_country,
    identityCountryCode: row.identity_country_code,
    notes: row.notes,
    bindingSummary: parseBindingSummary(row.binding_summary),
    deletedAt: row.deleted_at,
  };
}

export function createSimArchive(input: CreateSimArchiveInput) {
  ensureSimArchiveTable();
  const result = sqlite
    .prepare(
      `INSERT INTO sim_deleted_records (
        original_sim_id, label, phone_number, country, country_code, carrier_name, sim_type,
        iccid, balance, currency_code, activation_date, valid_until, tariff_plan_name,
        identity_status, identity_name, identity_document_type, identity_country,
        identity_country_code, notes, binding_summary, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.originalSimId,
      input.label,
      input.phoneNumber,
      input.country,
      input.countryCode,
      input.carrierName,
      input.simType,
      input.iccid,
      input.balance,
      input.currencyCode,
      input.activationDate,
      input.validUntil,
      input.tariffPlanName,
      input.identityStatus,
      input.identityName,
      input.identityDocumentType,
      input.identityCountry,
      input.identityCountryCode,
      input.notes,
      JSON.stringify(input.bindingSummary),
      input.deletedAt,
    );
  return Number(result.lastInsertRowid);
}

export function listSimArchives() {
  ensureSimArchiveTable();
  return (sqlite.prepare("SELECT * FROM sim_deleted_records ORDER BY deleted_at DESC, id DESC").all() as DeletedSimRow[]).map(mapRow);
}

export function deleteSimArchive(id: number) {
  ensureSimArchiveTable();
  return sqlite.prepare("DELETE FROM sim_deleted_records WHERE id = ?").run(id).changes > 0;
}

ensureSimArchiveTable();
