import "server-only";

import crypto from "node:crypto";

export const ENCRYPTED_BACKUP_FORMAT = "simkeeper-encrypted-portable-backup";
export const ENCRYPTED_BACKUP_FORMAT_VERSION = 1;

const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const AAD_LABEL = "SIMKeeper/portable-backup/v1";

export type EncryptedPortableBackup = {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  formatVersion: typeof ENCRYPTED_BACKUP_FORMAT_VERSION;
  appVersion: string;
  createdAt: string;
  encryption: {
    kdf: "scrypt";
    n: number;
    r: number;
    p: number;
    salt: string;
    cipher: "aes-256-gcm";
    iv: string;
    tag: string;
  };
  ciphertext: string;
};

function makeAad(appVersion: string, createdAt: string) {
  return Buffer.from(
    JSON.stringify({
      label: AAD_LABEL,
      format: ENCRYPTED_BACKUP_FORMAT,
      formatVersion: ENCRYPTED_BACKUP_FORMAT_VERSION,
      appVersion,
      createdAt,
    }),
    "utf8",
  );
}

export function validateBackupPassphrase(passphrase: string) {
  if (typeof passphrase !== "string" || Array.from(passphrase).length < 8) {
    throw new Error("备份口令至少需要 8 个字符");
  }
  if (Buffer.byteLength(passphrase, "utf8") > 1024) {
    throw new Error("备份口令过长");
  }
  return passphrase;
}

function deriveKey(passphrase: string, salt: Buffer) {
  validateBackupPassphrase(passphrase);
  return crypto.scryptSync(passphrase, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function isEncryptedPortableBackup(value: unknown): value is EncryptedPortableBackup {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (value as { format?: unknown }).format === ENCRYPTED_BACKUP_FORMAT,
  );
}

function parseEncryptedEnvelope(value: unknown): EncryptedPortableBackup {
  if (!isEncryptedPortableBackup(value)) {
    throw new Error("这不是 SIMKeeper 加密可移植备份");
  }

  const raw = value as Partial<EncryptedPortableBackup>;
  if (raw.formatVersion !== ENCRYPTED_BACKUP_FORMAT_VERSION) {
    throw new Error("加密备份格式版本不受支持");
  }
  if (typeof raw.appVersion !== "string" || typeof raw.createdAt !== "string") {
    throw new Error("加密备份元数据不完整");
  }
  if (!raw.encryption || typeof raw.encryption !== "object") {
    throw new Error("加密备份参数缺失");
  }

  const encryption = raw.encryption as EncryptedPortableBackup["encryption"];
  if (
    encryption.kdf !== "scrypt"
    || encryption.cipher !== "aes-256-gcm"
    || encryption.n !== SCRYPT_N
    || encryption.r !== SCRYPT_R
    || encryption.p !== SCRYPT_P
    || typeof encryption.salt !== "string"
    || typeof encryption.iv !== "string"
    || typeof encryption.tag !== "string"
    || typeof raw.ciphertext !== "string"
  ) {
    throw new Error("加密备份使用了当前版本不支持的加密参数");
  }

  return raw as EncryptedPortableBackup;
}

export function encryptPortableBackup(
  value: unknown,
  metadata: { appVersion: string; createdAt: string },
  passphrase: string,
): EncryptedPortableBackup {
  validateBackupPassphrase(passphrase);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const aad = makeAad(metadata.appVersion, metadata.createdAt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    formatVersion: ENCRYPTED_BACKUP_FORMAT_VERSION,
    appVersion: metadata.appVersion,
    createdAt: metadata.createdAt,
    encryption: {
      kdf: "scrypt",
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      salt: salt.toString("base64url"),
      cipher: "aes-256-gcm",
      iv: iv.toString("base64url"),
      tag: tag.toString("base64url"),
    },
    ciphertext: encrypted.toString("base64url"),
  };
}

export function decryptPortableBackup(value: unknown, passphrase: string): unknown {
  const envelope = parseEncryptedEnvelope(value);
  validateBackupPassphrase(passphrase);

  try {
    const salt = Buffer.from(envelope.encryption.salt, "base64url");
    const iv = Buffer.from(envelope.encryption.iv, "base64url");
    const tag = Buffer.from(envelope.encryption.tag, "base64url");
    const encrypted = Buffer.from(envelope.ciphertext, "base64url");
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== 16) {
      throw new Error("invalid encrypted backup parameters");
    }

    const key = deriveKey(passphrase, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(makeAad(envelope.appVersion, envelope.createdAt));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new Error("备份口令错误，或备份文件已经损坏");
  }
}

export function encryptedBackupFilename(createdAt: string) {
  const stamp = createdAt.replace(/[-:]/g, "").replace(".", "-");
  return `simkeeper-secure-backup-${stamp}.simkeeper-backup`;
}
