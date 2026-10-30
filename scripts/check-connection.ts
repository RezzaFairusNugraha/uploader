import { createDatabricksClient } from "../src/lib/databricks";
import { getDatabricksConfig, getDatabaseUrlConfig } from "../src/platform/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  console.log("Memeriksa konfigurasi koneksi...");
  let hasError = false;

  const dbUrl = getDatabaseUrlConfig();
  if (!dbUrl) {
    console.log("Database: Belum terhubung (DATABASE_URL belum diisi)");
    hasError = true;
  } else {
    try {
      const sql = neon(dbUrl);
      await sql`SELECT 1 as connected`;
      console.log("Database: Terhubung dengan baik");
    } catch (err: unknown) {
      hasError = true;
      const msg = err instanceof Error ? err.message : "Gagal terhubung";
      console.log(`Database: Gagal terhubung (${msg})`);
    }
  }

  const dbr = getDatabricksConfig();
  if (!dbr) {
    console.log("Databricks: Belum terhubung (variabel lingkungan belum lengkap)");
    hasError = true;
  } else {
    try {
      const client = createDatabricksClient(dbr.host, dbr.token);
      const catRes = await client.getCatalog(dbr.catalog);
      if (!catRes.success) {
        hasError = true;
        console.log(`Databricks: Gagal mengakses katalog ${dbr.catalog} (${catRes.error || "Akses ditolak atau katalog tidak ditemukan"})`);
      } else {
        console.log(`Databricks: Terhubung ke host dan katalog ${dbr.catalog} siap digunakan`);
      }
    } catch (err: unknown) {
      hasError = true;
      const msg = err instanceof Error ? err.message : "Gagal terhubung";
      console.log(`Databricks: Gagal terhubung (${msg})`);
    }
  }

  if (hasError) {
    console.log("\nHasil: Ada koneksi yang belum siap. Periksa variabel lingkungan Anda.");
    process.exit(1);
  } else {
    console.log("\nHasil: Semua koneksi siap digunakan.");
    process.exit(0);
  }
}

main().catch(() => {
  console.log("Terjadi kendala saat memeriksa koneksi.");
  process.exit(1);
});
