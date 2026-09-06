import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/db";

const SECRET_BYTES = 32;
const IV_BYTES = 12;
const SECRET_PATH = path.join(dataDir, ".credential-secret");
const ESIM_AAD = Buffer.from("SIMKeeper/eSIM/v1", "utf8");
const CARRIER_CONNECTOR_AAD = Buffer.from("SIMKeeper/carrier-connector/v1", "utf8");

function readSecretBuffer() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(SECRET_PATH)) {
    const secret = crypto.randomBytes(SECRET_BYTES).toString("base64url");
    try {
      fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600, flag: "wx" });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code !== "EEXIST") throw error;
    }
  }

  const raw = fs.readFileSync(SECRET_PATH, "utf8").trim();
  const secret = Buffer.from(raw, "base64url");
  if (secret.length !== SECRET_BYTES) {
    throw new Error("凭据加密密钥无效，请检查 data/.credential-secret");
  }
  return secret;
}

function encryptWithAad(value: string | null | undefined, aad: Buffer) {
  if (!value) return null;
  const key = readSecretBuffer();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptWithAad(
  value: string | null | undefined,
  aad: Buffer,
  errorMessage: string,
) {
  if (!value) return "";
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("凭据密文格式不受支持");
  }

  try {
    const key = readSecretBuffer();
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(errorMessage);
  }
}

export function encryptCredential(value: string | null | undefined) {
  return encryptWithAad(value, ESIM_AAD);
}

export function decryptCredential(value: string | null | undefined) {
  return decryptWithAad(
    value,
    ESIM_AAD,
    "eSIM 凭据无法解密；请确认恢复时同时保留了对应的凭据密钥",
  );
}

export function encryptCarrierConnectorCredential(value: string | null | undefined) {
  return encryptWithAad(value, CARRIER_CONNECTOR_AAD);
}

export function decryptCarrierConnectorCredential(value: string | null | undefined) {
  return decryptWithAad(
    value,
    CARRIER_CONNECTOR_AAD,
    "运营商连接凭据无法解密；请确认恢复时同时保留了对应的凭据密钥",
  );
}

export function exportCredentialSecret() {
  return readSecretBuffer().toString("base64url");
}

export function importCredentialSecret(value: string) {
  const normalized = value.trim();
  const secret = Buffer.from(normalized, "base64url");
  if (secret.length !== SECRET_BYTES) throw new Error("备份中的凭据密钥无效");

  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${SECRET_PATH}.tmp`;
  fs.writeFileSync(temporary, normalized, { mode: 0o600 });
  fs.renameSync(temporary, SECRET_PATH);
  try {
    fs.chmodSync(SECRET_PATH, 0o600);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
}
