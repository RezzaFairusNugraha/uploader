import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { inspectVolume } from "@/lib/databricks/inspect";
import { readDecryptedSettings } from "@/lib/settings";
import {
  templateRepository,
  templateVersionRepository,
  type TemplateDefinition,
} from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { catalog, schema } = body;
    const volumeName =
      typeof body.volume === "string" && body.volume.trim()
        ? body.volume.trim()
        : Array.isArray(body.volumes) && body.volumes.length > 0
        ? String(body.volumes[0]).trim()
        : null;

    if (!catalog || !schema || !volumeName) {
      return NextResponse.json(
        { error: "Katalog, skema, dan nama folder wajib diisi" },
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

    const alreadyExists = existingTemplates.some(
      (t) =>
        t.volume.catalog.toLowerCase() === catalog.toLowerCase() &&
        t.volume.schema.toLowerCase() === schema.toLowerCase() &&
        t.volume.name.toLowerCase() === volumeName.toLowerCase()
    );

    if (alreadyExists) {
      return NextResponse.json({
        success: true,
        imported: 0,
        skipped: 1,
        created: [],
      });
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

    return NextResponse.json({
      success: true,
      imported: 1,
      skipped: 0,
      created: [saved],
      template: saved,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
