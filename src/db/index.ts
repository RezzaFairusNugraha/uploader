import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getEnv } from "@/platform/env";
import * as schema from "./schema";

export function getDatabaseUrl(): string {
  const url = getEnv("DATABASE_URL");
  if (!url) {
    throw new Error(
      "DATABASE_URL belum dikonfigurasi. Hubungi administrator untuk mengisi variabel lingkungan di pengaturan deployment."
    );
  }
  return url;
}

export function createDb() {
  const sql = neon(getDatabaseUrl());
  return drizzle(sql, { schema });
}

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 300): Promise<T> {
  const timeoutMs = 10000;
  const executeWithTimeout = () =>
    Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Koneksi database batas waktu (timeout)")),
          timeoutMs
        )
      ),
    ]);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeWithTimeout();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
