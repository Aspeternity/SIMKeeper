import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, dataDir } from "@/db";
import { users } from "@/db/schema";
import { isTwoFactorEnabled } from "@/lib/totp";

export const SESSION_COOKIE_NAME = "simkeeper_session";
export const TWO_FACTOR_PENDING_COOKIE_NAME = "simkeeper_2fa_pending";
export const SESSION_MAX_AGE_DAYS = 30;
export const TWO_FACTOR_PENDING_MAX_AGE_MINUTES = 5;
const SESSION_MAX_AGE = 60 * 60 * 24 * SESSION_MAX_AGE_DAYS;
const TWO_FACTOR_PENDING_MAX_AGE = 60 * TWO_FACTOR_PENDING_MAX_AGE_MINUTES;
const SESSION_SECRET_BYTES = 48;
const PASSWORD_MIN_CHARACTERS = 10;
const PASSWORD_MAX_BYTES = 72;
const secretPath = path.join(dataDir, ".session-secret");

function writeSessionSecret(value: string) {
  const temporaryPath = `${secretPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temporaryPath, value, { mode: 0o600 });
  fs.renameSync(temporaryPath, secretPath);
  try {
    fs.chmodSync(secretPath, 0o600);
  } catch {
    // Some mounted filesystems do not support chmod. The session secret still remains inside dataDir.
  }
}

function generateSessionSecret() {
  return crypto.randomBytes(SESSION_SECRET_BYTES).toString("base64url");
}

function getSecret() {
  if (!fs.existsSync(secretPath)) writeSessionSecret(generateSessionSecret());
  return new TextEncoder().encode(fs.readFileSync(secretPath, "utf8").trim());
}

export function rotateSessionSecret() {
  writeSessionSecret(generateSessionSecret());
}

export function validateUsername(username: string) {
  const cleanUsername = username.trim();
  const length = Array.from(cleanUsername).length;
  if (length < 3 || length > 32) {
    throw new Error("用户名长度需要在 3 到 32 个字符之间");
  }
  if (/[\u0000-\u001f\u007f]/.test(cleanUsername)) {
    throw new Error("用户名不能包含控制字符");
  }
  return cleanUsername;
}

export function validatePassword(password: string) {
  if (Array.from(password).length < PASSWORD_MIN_CHARACTERS) {
    throw new Error(`密码至少需要 ${PASSWORD_MIN_CHARACTERS} 个字符`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error(`密码不能超过 ${PASSWORD_MAX_BYTES} 个 UTF-8 字节`);
  }
  return password;
}

export function hasAdmin() {
  return Boolean(db.select({ id: users.id }).from(users).limit(1).get());
}

export async function createAdmin(username: string, password: string) {
  if (hasAdmin()) {
    throw new Error("管理员账户已经存在");
  }

  const cleanUsername = validateUsername(username);
  validatePassword(password);

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);

  return db
    .insert(users)
    .values({ username: cleanUsername, passwordHash, createdAt: now, updatedAt: now })
    .returning({ id: users.id, username: users.username })
    .get();
}

export function getAdminAccount(userId: number) {
  return (
    db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get() ?? null
  );
}

export async function verifyUserPassword(userId: number, password: string) {
  const user = db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function updateAdminUsername(userId: number, username: string) {
  const cleanUsername = validateUsername(username);
  const current = getAdminAccount(userId);
  if (!current) throw new Error("管理员账户不存在");
  if (current.username === cleanUsername) throw new Error("新用户名与当前用户名相同");

  db.update(users)
    .set({ username: cleanUsername, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();

  const updated = getAdminAccount(userId);
  if (!updated) throw new Error("管理员账户更新失败");
  return updated;
}

export async function updateAdminPassword(userId: number, password: string) {
  validatePassword(password);
  const existing = db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!existing) throw new Error("管理员账户不存在");
  if (await bcrypt.compare(password, existing.passwordHash)) {
    throw new Error("新密码不能与当前密码相同");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  db.update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();

  const updated = getAdminAccount(userId);
  if (!updated) throw new Error("管理员账户更新失败");
  return updated;
}

export async function authenticate(username: string, password: string) {
  const user = db.select().from(users).where(eq(users.username, username.trim())).get();
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    username: user.username,
    twoFactorEnabled: isTwoFactorEnabled(user.id),
  };
}

export async function createSessionToken(
  user: { id: number; username: string },
  options?: { twoFactorVerified?: boolean },
) {
  return new SignJWT({
    username: user.username,
    twoFactorVerified: options?.twoFactorVerified === true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_DAYS}d`)
    .sign(getSecret());
}

export async function createTwoFactorPendingToken(user: { id: number; username: string }) {
  return new SignJWT({ username: user.username, purpose: "two-factor" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${TWO_FACTOR_PENDING_MAX_AGE_MINUTES}m`)
    .sign(getSecret());
}

export function isSessionCookieSecure() {
  return process.env.SIMKEEPER_COOKIE_SECURE === "true";
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSessionCookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function getTwoFactorPendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSessionCookieSecure(),
    path: "/",
    maxAge: TWO_FACTOR_PENDING_MAX_AGE,
  };
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) return null;

    const user =
      db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, id))
        .get() ?? null;
    if (!user) return null;
    if (isTwoFactorEnabled(id) && payload.twoFactorVerified !== true) return null;
    return user;
  } catch {
    return null;
  }
}

export async function verifyTwoFactorPendingToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0 || payload.purpose !== "two-factor") return null;
    if (!isTwoFactorEnabled(id)) return null;

    return (
      db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, id))
        .get() ?? null
    );
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

export async function getPendingTwoFactorUser() {
  const store = await cookies();
  const token = store.get(TWO_FACTOR_PENDING_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyTwoFactorPendingToken(token);
}
