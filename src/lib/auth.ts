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

export const SESSION_COOKIE_NAME = "simkeeper_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const secretPath = path.join(dataDir, ".session-secret");

function getSecret() {
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
  }

  return new TextEncoder().encode(fs.readFileSync(secretPath, "utf8").trim());
}

export function hasAdmin() {
  return Boolean(db.select({ id: users.id }).from(users).limit(1).get());
}

export async function createAdmin(username: string, password: string) {
  if (hasAdmin()) {
    throw new Error("管理员账户已经存在");
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 32) {
    throw new Error("用户名长度需要在 3 到 32 个字符之间");
  }
  if (password.length < 8) {
    throw new Error("密码至少需要 8 个字符");
  }

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);

  return db
    .insert(users)
    .values({ username: cleanUsername, passwordHash, createdAt: now, updatedAt: now })
    .returning({ id: users.id, username: users.username })
    .get();
}

export async function authenticate(username: string, password: string) {
  const user = db.select().from(users).where(eq(users.username, username.trim())).get();
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, username: user.username };
}

export async function createSessionToken(user: { id: number; username: string }) {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SIMKEEPER_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) return null;

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
