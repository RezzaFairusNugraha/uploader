import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
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

export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  const timeoutMs = 8000;
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

  try {
    return await executeWithTimeout();
  } catch {
    return await executeWithTimeout();
  }
}
