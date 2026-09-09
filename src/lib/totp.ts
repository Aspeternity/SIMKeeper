import "server-only";

import crypto from "node:crypto";
import QRCode from "qrcode";
import { sqlite } from "@/db";
import {
  decryptTotpSecret,
  decryptTotpSetupPayload,
  encryptTotpSecret,
  encryptTotpSetupPayload,
  hashTotpRecoveryCode,
} from "@/lib/credential-crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const SETUP_MAX_AGE_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 12;

type TotpRow = {
  totp_secret_ciphertext: string | null;
  totp_enabled_at: string | null;
  totp_recovery_hashes: string | null;
};

type SetupPayload = {
  userId: number;
  secret: string;
  issuedAt: number;
};

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export type SecondFactorResult = {
  ok: boolean;
  method: "totp" | "recovery" | null;
  recoveryCodesRemaining: number;
};

function readTotpRow(userId: number): TotpRow | null {
  return (
    (sqlite
      .prepare(
        `SELECT totp_secret_ciphertext, totp_enabled_at, totp_recovery_hashes
         FROM users
         WHERE id = ?`,
      )
      .get(userId) as TotpRow | undefined) ?? null
  );
}

function parseRecoveryHashes(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [] as string[];
  }
}

function encodeBase32(bytes: Buffer) {
  let bits = 0;
  let buffer = 0;
  let output = "";

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
      buffer &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("TOTP Base32 密钥格式无效");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
      buffer &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

function hotp(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpCode(secret: string, now = Date.now()) {
  return hotp(secret, Math.floor(now / 1000 / TOTP_PERIOD_SECONDS));
}

export function verifyTotpCode(secret: string, code: string, now = Date.now()) {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const currentCounter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  const candidate = Buffer.from(normalized, "utf8");
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const expected = Buffer.from(hotp(secret, currentCounter + offset), "utf8");
    if (expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate)) return true;
  }
  return false;
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateRecoveryCode() {
  let value = "";
  for (let index = 0; index < RECOVERY_CODE_LENGTH; index += 1) {
    value += RECOVERY_ALPHABET[crypto.randomInt(0, RECOVERY_ALPHABET.length)];
  }
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

function generateRecoveryCodes() {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(generateRecoveryCode());
  return Array.from(codes);
}

function recoveryHashes(codes: string[]) {
  return codes.map((code) => hashTotpRecoveryCode(normalizeRecoveryCode(code)));
}

export function isTwoFactorEnabled(userId: number) {
  const row = readTotpRow(userId);
  return Boolean(row?.totp_enabled_at && row.totp_secret_ciphertext);
}

export function getTwoFactorStatus(userId: number): TwoFactorStatus {
  const row = readTotpRow(userId);
  const enabled = Boolean(row?.totp_enabled_at && row.totp_secret_ciphertext);
  return {
    enabled,
    enabledAt: enabled ? row?.totp_enabled_at ?? null : null,
    recoveryCodesRemaining: enabled ? parseRecoveryHashes(row?.totp_recovery_hashes).length : 0,
  };
}

export async function beginTwoFactorSetup(userId: number, accountName: string, issuerName: string) {
  if (isTwoFactorEnabled(userId)) throw new Error("双重验证已经启用");

  const secret = encodeBase32(crypto.randomBytes(20));
  const issuer = issuerName.trim() || "SIMKeeper";
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  const uri = `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  const qrDataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });
  const setupToken = encryptTotpSetupPayload(
    JSON.stringify({ userId, secret, issuedAt: Date.now() } satisfies SetupPayload),
  );

  return {
    secret,
    uri,
    qrDataUrl,
    setupToken,
    expiresInMinutes: Math.floor(SETUP_MAX_AGE_MS / 60_000),
  };
}

export function confirmTwoFactorSetup(userId: number, setupToken: string, code: string) {
  if (isTwoFactorEnabled(userId)) throw new Error("双重验证已经启用");

  let payload: SetupPayload;
  try {
    payload = JSON.parse(decryptTotpSetupPayload(setupToken)) as SetupPayload;
  } catch {
    throw new Error("双重验证配置已失效，请重新开始配置");
  }

  if (
    payload.userId !== userId ||
    typeof payload.secret !== "string" ||
    !Number.isFinite(payload.issuedAt) ||
    Date.now() - payload.issuedAt > SETUP_MAX_AGE_MS ||
    payload.issuedAt > Date.now() + 60_000
  ) {
    throw new Error("双重验证配置已失效，请重新开始配置");
  }
  if (!verifyTotpCode(payload.secret, code)) {
    throw new Error("动态验证码不正确，请确认手机时间已自动同步后重试");
  }

  const codes = generateRecoveryCodes();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE users
       SET totp_secret_ciphertext = ?, totp_enabled_at = ?, totp_recovery_hashes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      encryptTotpSecret(payload.secret),
      now,
      JSON.stringify(recoveryHashes(codes)),
      now,
      userId,
    );

  return { recoveryCodes: codes, enabledAt: now };
}

export function verifySecondFactor(userId: number, value: string): SecondFactorResult {
  const row = readTotpRow(userId);
  const hashes = parseRecoveryHashes(row?.totp_recovery_hashes);
  if (!row?.totp_enabled_at || !row.totp_secret_ciphertext) {
    return { ok: false, method: null, recoveryCodesRemaining: 0 };
  }

  const trimmed = value.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s+/g, ""))) {
    const secret = decryptTotpSecret(row.totp_secret_ciphertext);
    if (verifyTotpCode(secret, trimmed)) {
      return { ok: true, method: "totp", recoveryCodesRemaining: hashes.length };
    }
  }

  const normalizedRecovery = normalizeRecoveryCode(trimmed);
  if (normalizedRecovery.length === RECOVERY_CODE_LENGTH) {
    const digest = hashTotpRecoveryCode(normalizedRecovery);
    const index = hashes.findIndex((item) => item === digest);
    if (index >= 0) {
      const remaining = hashes.filter((_, itemIndex) => itemIndex !== index);
      sqlite
        .prepare("UPDATE users SET totp_recovery_hashes = ? WHERE id = ?")
        .run(JSON.stringify(remaining), userId);
      return { ok: true, method: "recovery", recoveryCodesRemaining: remaining.length };
    }
  }

  return { ok: false, method: null, recoveryCodesRemaining: hashes.length };
}

export function regenerateRecoveryCodes(userId: number) {
  if (!isTwoFactorEnabled(userId)) throw new Error("双重验证尚未启用");
  const codes = generateRecoveryCodes();
  sqlite
    .prepare("UPDATE users SET totp_recovery_hashes = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(recoveryHashes(codes)), new Date().toISOString(), userId);
  return codes;
}

export function disableTwoFactor(userId: number) {
  if (!isTwoFactorEnabled(userId)) throw new Error("双重验证尚未启用");
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE users
       SET totp_secret_ciphertext = NULL,
           totp_enabled_at = NULL,
           totp_recovery_hashes = NULL,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(now, userId);
}
