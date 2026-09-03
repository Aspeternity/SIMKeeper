import "server-only";

import { sqlite } from "@/db";
import { decryptCredential, encryptCredential } from "@/lib/credential-crypto";
import {
  buildLpaString,
  parseLpaString,
  type EsimProfileFormValue,
  type EsimProfileSecrets,
  type EsimProfileSource,
  type EsimProfileStatus,
  type EsimProfileSummary,
  type EsimReusePolicy,
} from "@/lib/esim-profile-types";


export function ensureEsimProfileTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sim_esim_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL UNIQUE,
      profile_status TEXT NOT NULL DEFAULT 'unknown',
      source TEXT,
      reuse_policy TEXT NOT NULL DEFAULT 'unknown',
      notes TEXT,
      smdp_address_encrypted TEXT,
      activation_code_encrypted TEXT,
      confirmation_code_encrypted TEXT,
      lpa_string_encrypted TEXT,
      original_qr_encrypted TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_esim_profiles_sim_id ON sim_esim_profiles(sim_id);
  `);
}

type RawEsimProfile = {
  id: number;
  sim_id: number;
  profile_status: string;
  source: string | null;
  reuse_policy: string;
  notes: string | null;
  smdp_address_encrypted: string | null;
  activation_code_encrypted: string | null;
  confirmation_code_encrypted: string | null;
  lpa_string_encrypted: string | null;
  original_qr_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

function getRawEsimProfile(simId: number) {
  ensureEsimProfileTable();
  return sqlite
    .prepare(
      `SELECT id, sim_id, profile_status, source, reuse_policy, notes,
              smdp_address_encrypted, activation_code_encrypted, confirmation_code_encrypted,
              lpa_string_encrypted, original_qr_encrypted, created_at, updated_at
       FROM sim_esim_profiles WHERE sim_id = ?`,
    )
    .get(simId) as RawEsimProfile | undefined;
}

function mapSummary(row: RawEsimProfile): EsimProfileSummary {
  return {
    id: row.id,
    simId: row.sim_id,
    profileStatus: row.profile_status as EsimProfileStatus,
    source: (row.source || null) as EsimProfileSource | null,
    reusePolicy: row.reuse_policy as EsimReusePolicy,
    notes: row.notes,
    hasSmdpAddress: Boolean(row.smdp_address_encrypted),
    hasActivationCode: Boolean(row.activation_code_encrypted),
    hasConfirmationCode: Boolean(row.confirmation_code_encrypted),
    hasLpaString: Boolean(row.lpa_string_encrypted),
    hasOriginalQr: Boolean(row.original_qr_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getEsimProfileSummary(simId: number) {
  const row = getRawEsimProfile(simId);
  return row ? mapSummary(row) : null;
}

export function revealEsimProfile(simId: number) {
  const row = getRawEsimProfile(simId);
  if (!row) return null;

  const secrets: EsimProfileSecrets = {
    smdpAddress: decryptCredential(row.smdp_address_encrypted),
    activationCode: decryptCredential(row.activation_code_encrypted),
    confirmationCode: decryptCredential(row.confirmation_code_encrypted),
    lpaString: decryptCredential(row.lpa_string_encrypted),
    originalQrDataUrl: decryptCredential(row.original_qr_encrypted),
  };

  return { ...mapSummary(row), secrets };
}

function resolveSecret(incoming: string | undefined, currentEncrypted: string | null | undefined) {
  if (incoming === undefined) return currentEncrypted || null;
  const normalized = incoming.trim();
  return normalized ? encryptCredential(normalized) : null;
}

function resolveRawSecret(incoming: string | undefined, currentEncrypted: string | null | undefined) {
  if (incoming !== undefined) return incoming.trim();
  return decryptCredential(currentEncrypted);
}

export function hasMeaningfulEsimProfile(value: EsimProfileFormValue | null | undefined) {
  if (!value) return false;
  return Boolean(
    value.profileStatus !== "unknown"
      || value.source
      || value.reusePolicy !== "unknown"
      || value.notes.trim()
      || value.smdpAddress?.trim()
      || value.activationCode?.trim()
      || value.confirmationCode?.trim()
      || value.lpaString?.trim()
      || value.originalQrDataUrl?.trim(),
  );
}

export function upsertEsimProfile(simId: number, input: EsimProfileFormValue) {
  const existing = getRawEsimProfile(simId);

  let smdpAddress = input.smdpAddress;
  let activationCode = input.activationCode;
  let lpaString = input.lpaString;

  if (lpaString !== undefined && lpaString.trim()) {
    const parsed = parseLpaString(lpaString);
    if (!parsed) throw new Error("LPA 激活字符串格式不正确，应类似 LPA:1$SM-DP+$ActivationCode");
    lpaString = parsed.lpaString;
    smdpAddress = parsed.smdpAddress;
    activationCode = parsed.activationCode;
  } else if (smdpAddress !== undefined || activationCode !== undefined) {
    const finalSmdpAddress = resolveRawSecret(smdpAddress, existing?.smdp_address_encrypted);
    const finalActivationCode = resolveRawSecret(activationCode, existing?.activation_code_encrypted);
    lpaString = buildLpaString(finalSmdpAddress, finalActivationCode);
  }

  const smdpAddressEncrypted = resolveSecret(smdpAddress, existing?.smdp_address_encrypted);
  const activationCodeEncrypted = resolveSecret(activationCode, existing?.activation_code_encrypted);
  const confirmationCodeEncrypted = resolveSecret(input.confirmationCode, existing?.confirmation_code_encrypted);
  const lpaStringEncrypted = resolveSecret(lpaString, existing?.lpa_string_encrypted);
  const originalQrEncrypted = input.originalQrDataUrl === undefined
    ? existing?.original_qr_encrypted || null
    : input.originalQrDataUrl
      ? encryptCredential(input.originalQrDataUrl)
      : null;

  const now = new Date().toISOString();
  if (existing) {
    sqlite
      .prepare(
        `UPDATE sim_esim_profiles
         SET profile_status = ?, source = ?, reuse_policy = ?, notes = ?,
             smdp_address_encrypted = ?, activation_code_encrypted = ?, confirmation_code_encrypted = ?,
             lpa_string_encrypted = ?, original_qr_encrypted = ?, updated_at = ?
         WHERE sim_id = ?`,
      )
      .run(
        input.profileStatus,
        input.source || null,
        input.reusePolicy,
        input.notes.trim() || null,
        smdpAddressEncrypted,
        activationCodeEncrypted,
        confirmationCodeEncrypted,
        lpaStringEncrypted,
        originalQrEncrypted,
        now,
        simId,
      );
  } else {
    sqlite
      .prepare(
        `INSERT INTO sim_esim_profiles (
           sim_id, profile_status, source, reuse_policy, notes,
           smdp_address_encrypted, activation_code_encrypted, confirmation_code_encrypted,
           lpa_string_encrypted, original_qr_encrypted, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        simId,
        input.profileStatus,
        input.source || null,
        input.reusePolicy,
        input.notes.trim() || null,
        smdpAddressEncrypted,
        activationCodeEncrypted,
        confirmationCodeEncrypted,
        lpaStringEncrypted,
        originalQrEncrypted,
        now,
        now,
      );
  }

  return getEsimProfileSummary(simId);
}

export function deleteEsimProfile(simId: number) {
  ensureEsimProfileTable();
  sqlite.prepare("DELETE FROM sim_esim_profiles WHERE sim_id = ?").run(simId);
}
