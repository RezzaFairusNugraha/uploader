import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export function signAdminToken(): string {
  const secret = ENCRYPTION_KEY || "fallback_admin_secret_key_antigravity";
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `admin:${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const secret = ENCRYPTION_KEY || "fallback_admin_secret_key_antigravity";
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;

    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (signature !== expected) return false;

    const [role, expiresAtStr] = payload.split(":");
    if (role !== "admin") return false;
    const expiresAt = Number(expiresAtStr);
    if (Date.now() > expiresAt) return false;

    return true;
  } catch {
    return false;
  }
}

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (!attempt) return { allowed: true };

  if (attempt.lockedUntil > now) {
    const waitSeconds = Math.ceil((attempt.lockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (attempt.lockedUntil <= now && attempt.count >= 5) {
    loginAttempts.delete(ip);
  }

  return { allowed: true };
}

export function recordFailedAttempt(ip: string): { locked: boolean; remaining: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  attempt.count += 1;

  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000;
    loginAttempts.set(ip, attempt);
    return { locked: true, remaining: 0 };
  }

  loginAttempts.set(ip, attempt);
  return { locked: false, remaining: 5 - attempt.count };
}

export function resetLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}
