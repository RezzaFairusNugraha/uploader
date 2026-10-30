import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import { adminLoginAttempts } from "@/db/schema";
import { getAdminConfig } from "@/platform/config";

export const ADMIN_COOKIE_NAME = "admin_session";
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip.trim().toLowerCase()).digest("hex");
}

export function verifyAdminPassword(input: string): boolean {
  const config = getAdminConfig();
  if (!config) return false;

  const expected = Buffer.from(config.password);
  const provided = Buffer.from(input);

  if (expected.length !== provided.length) {
    timingSafeEqual(expected, expected);
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export function signAdminToken(): string {
  const config = getAdminConfig();
  if (!config) {
    throw new Error("Konfigurasi admin belum lengkap");
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `admin:${expiresAt}`;
  const signature = createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const config = getAdminConfig();
  if (!config) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expectedSignature = createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length) return false;
  if (!timingSafeEqual(sigBuffer, expBuffer)) return false;

  const [role, expiresAtStr] = payload.split(":");
  if (role !== "admin") return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

export async function checkAdminRateLimit(ip: string): Promise<{ allowed: boolean; waitSeconds?: number }> {
  try {
    const ipH = hashIp(ip);
    const db = createDb();
    const rows = await db
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.ipHash, ipH))
      .limit(1);

    if (rows.length === 0) return { allowed: true };

    const row = rows[0];
    const now = Date.now();
    if (row.lockedUntil && row.lockedUntil.getTime() > now) {
      const waitSeconds = Math.ceil((row.lockedUntil.getTime() - now) / 1000);
      return { allowed: false, waitSeconds };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export async function recordFailedAdminLogin(ip: string): Promise<{ locked: boolean; remaining: number }> {
  const ipH = hashIp(ip);
  const now = new Date();
  try {
    const db = createDb();
    const rows = await db
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.ipHash, ipH))
      .limit(1);

    let nextCount = 1;
    let lockedUntil: Date | null = null;

    if (rows.length > 0) {
      const row = rows[0];
      if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
        return { locked: true, remaining: 0 };
      }
      nextCount = (row.attemptCount || 0) + 1;
      if (nextCount >= MAX_ATTEMPTS) {
        lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
      }
      await db
        .update(adminLoginAttempts)
        .set({
          attemptCount: nextCount,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(adminLoginAttempts.ipHash, ipH));
    } else {
      await db.insert(adminLoginAttempts).values({
        ipHash: ipH,
        attemptCount: 1,
        lockedUntil: null,
        updatedAt: now,
      });
    }

    if (nextCount >= MAX_ATTEMPTS) {
      return { locked: true, remaining: 0 };
    }
    return { locked: false, remaining: MAX_ATTEMPTS - nextCount };
  } catch {
    return { locked: false, remaining: 0 };
  }
}

export async function resetAdminLoginAttempts(ip: string): Promise<void> {
  const ipH = hashIp(ip);
  try {
    const db = createDb();
    await db
      .delete(adminLoginAttempts)
      .where(eq(adminLoginAttempts.ipHash, ipH));
  } catch {
  }
}
