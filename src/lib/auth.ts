import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, dataDir } from "@/db";
import { users } from "@/db/schema";

const COOKIE_NAME = "simkeeper_session";
const secretPath = path.join(dataDir, ".session-secret");

function getSecret() {
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
  }
  return new TextEncoder().encode(fs.readFileSync(secretPath, "utf8").trim());
}

export function getAdminCount() {
  return db.select({ id: users.id }).from(users).all().length;
}

export async function createAdmin(username: string, password: string) {
  if (getAdminCount() > 0) {
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
  const result = db
    .insert(users)
    .values({ username: cleanUsername, passwordHash, createdAt: now, updatedAt: now })
    .returning({ id: users.id, username: users.username })
    .get();

  return result;
}

export async function authenticate(username: string, password: string) {
  const user = db.select().from(users).where(eq(users.username, username.trim())).get();
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

export async function createSession(user: { id: number; username: string }) {
  const token = await new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SIMKEEPER_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = Number(payload.sub);
    if (!id) return null;
    const user = db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, id)).get();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  if (getAdminCount() === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
