import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { inspectVolume } from "@/lib/databricks/inspect";
import { readDecryptedSettings } from "@/lib/settings";
import {
  templateRepository,
  templateVersionRepository,
  type TemplateDefinition,
} from "@/lib/templates";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { catalog, schema, volumes } = body;

    if (!catalog || !schema || !Array.isArray(volumes) || volumes.length === 0) {
      return NextResponse.json(
        { error: "Katalog, skema, dan daftar folder wajib diisi" },
        { status: 400 }
      );
    }

    const settings = await readDecryptedSettings();
    if (!settings || !settings.workspaceUrl || !settings.token) {
      return NextResponse.json(
        { error: "Koneksi Databricks belum dikonfigurasi. Hubungi admin." },
        { status: 400 }
      );
    }

    const workspaceHost = settings.workspaceUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const existingTemplates = await templateRepository.list();

    let importedCount = 0;
    let skippedCount = 0;
    const createdTemplates: TemplateDefinition[] = [];

    for (const volumeName of volumes) {
      const alreadyExists = existingTemplates.some(
        (t) =>
          t.volume.catalog.toLowerCase() === catalog.toLowerCase() &&
          t.volume.schema.toLowerCase() === schema.toLowerCase() &&
          t.volume.name.toLowerCase() === volumeName.toLowerCase()
      );

      if (alreadyExists) {
        skippedCount++;
        continue;
      }

      const inspectResult = await inspectVolume(client, catalog, schema, volumeName);
      const draft = inspectResult.draft;

      const baseSlug = draft.slug;
      let finalSlug = baseSlug;
      let counter = 2;
      while (await templateRepository.getBySlug(finalSlug)) {
        finalSlug = `${baseSlug.slice(0, 50)}_${counter}`;
        counter++;
      }

      const now = new Date().toISOString();
      const newTemplate: TemplateDefinition = {
        id: crypto.randomUUID(),
        name: draft.name,
        slug: finalSlug,
        description: "",
        delimiter: draft.delimiter,
        status: "draf_deteksi",
        volume: {
          catalog,
          schema,
          name: volumeName,
        },
        volumeCreatedByApp: false,
        csvFolder: draft.csvFolder || "csv",
        parquetFolder: draft.parquetFolder || "parquet",
        workspaceHost,
        needsCheck: false,
        columns: draft.columns,
        version: 1,
        createdBy: "Deteksi otomatis",
        createdAt: now,
        updatedAt: now,
      };

      const saved = await templateRepository.create(newTemplate);
      await templateVersionRepository.add({
        templateId: saved.id,
        version: 1,
        snapshot: saved,
        changeSummary: "Template diimpor dari folder Databricks",
        isBreaking: false,
        changedBy: "Deteksi otomatis",
      });

      createdTemplates.push(saved);
      importedCount++;
    }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      templates: createdTemplates,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan saat mengimpor draf";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
