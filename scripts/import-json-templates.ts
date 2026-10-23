import fs from "node:fs/promises";
import path from "node:path";
import { getTemplateRepository } from "../src/lib/templates/repository";
import { TemplateDefinitionSchema } from "../src/lib/templates/schema";

async function main() {
  const templatesDir = path.join(process.cwd(), "data", "templates");

  try {
    await fs.access(templatesDir);
  } catch {
    console.log("Direktori data/templates tidak ditemukan. Tidak ada data yang diimpor.");
    return;
  }

  const files = await fs.readdir(templatesDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  if (jsonFiles.length === 0) {
    console.log("Tidak ada berkas JSON di data/templates.");
    return;
  }

  const repo = getTemplateRepository();
  let importedCount = 0;
  let skippedCount = 0;

  for (const file of jsonFiles) {
    const fullPath = path.join(templatesDir, file);
    try {
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      const validated = TemplateDefinitionSchema.parse(parsed);

      const existing = await repo.getBySlug(validated.slug);
      if (existing) {
        console.log(`[SKIP] Template '${validated.name}' (${validated.slug}) sudah ada.`);
        skippedCount++;
        continue;
      }

      await repo.create(validated);
      console.log(`[OK] Berhasil mengimpor '${validated.name}' (${validated.slug}).`);
      importedCount++;
    } catch (err) {
      console.error(`[ERROR] Gagal memproses berkas ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nSelesai: ${importedCount} diimpor, ${skippedCount} dilewati.`);
}

main().catch((err) => {
  console.error("Gagal menjalankan import template:", err);
  process.exit(1);
});
