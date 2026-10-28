import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const settings = await readDecryptedSettings();
    if (!settings || !settings.workspaceUrl || !settings.token) {
      return NextResponse.json(
        { error: "Koneksi Databricks belum dikonfigurasi. Hubungi admin." },
        { status: 400 }
      );
    }

    const catalog = searchParams.get("catalog") || settings.catalog || "";
    if (!catalog) {
      return NextResponse.json(
        { error: "Katalog Databricks wajib ditentukan" },
        { status: 400 }
      );
    }

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const schema = searchParams.get("schema");

    if (!schema) {
      const schemasRes = await client.listSchemas(catalog);
      if (!schemasRes.success) {
        return NextResponse.json(
          { error: schemasRes.error || "Gagal memuat skema Databricks" },
          { status: schemasRes.status || 500 }
        );
      }

      const filteredSchemas = (schemasRes.data?.schemas || [])
        .map((s) => s.name)
        .filter((name) => {
          const lower = name.toLowerCase();
          return (
            lower !== "information_schema" &&
            lower !== "default" &&
            !name.startsWith("_") &&
            !name.startsWith(".")
          );
        });

      return NextResponse.json({
        catalog,
        schemas: filteredSchemas,
      });
    }

    const singleVolume = searchParams.get("volume");

    if (singleVolume) {
      const allTemplates = await templateRepository.list();
      const matched = allTemplates.find(
        (t) =>
          t.volume.catalog.toLowerCase() === catalog.toLowerCase() &&
          t.volume.schema.toLowerCase() === schema.toLowerCase() &&
          t.volume.name.toLowerCase() === singleVolume.toLowerCase()
      );

      let csvFiles = 0;
      let parquetFiles = 0;
      const unsupportedMap = new Map<string, number>();

      const rootRes = await client.listDirectory(`/Volumes/${catalog}/${schema}/${singleVolume}`);
      const entries = rootRes.success && rootRes.data ? rootRes.data.contents : [];

      for (const entry of entries) {
        if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

        if (entry.is_directory) {
          const subRes = await client.listDirectory(entry.path);
          const subEntries = subRes.success && subRes.data ? subRes.data.contents : [];
          for (const sub of subEntries) {
            if (sub.is_directory || sub.name.startsWith("_") || sub.name.startsWith(".")) continue;
            const ext = (sub.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
            if (ext === ".csv" || ext === ".tsv") {
              csvFiles++;
            } else if (ext === ".parquet") {
              parquetFiles++;
            } else {
              unsupportedMap.set(ext || "lainnya", (unsupportedMap.get(ext || "lainnya") || 0) + 1);
            }
          }
        } else {
          const ext = (entry.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
          if (ext === ".csv" || ext === ".tsv") {
            csvFiles++;
          } else if (ext === ".parquet") {
            parquetFiles++;
          } else {
            unsupportedMap.set(ext || "lainnya", (unsupportedMap.get(ext || "lainnya") || 0) + 1);
          }
        }
      }

      const unsupportedFormats = Array.from(unsupportedMap.entries())
        .map(([ext, count]) => ({ ext, count }))
        .sort((a, b) => b.count - a.count);

      let status: "sudah_template" | "belum_template" | "bukan_template" = "belum_template";
      if (matched) {
        status = "sudah_template";
      } else if (csvFiles === 0 && parquetFiles === 0) {
        status = "bukan_template";
      }

      return NextResponse.json({
        volume: {
          name: singleVolume,
          catalog,
          schema,
          status,
          csvFiles,
          parquetFiles,
          unsupportedFormats,
          templateId: matched?.id,
          templateName: matched?.name,
        },
      });
    }

    const volumesRes = await client.listVolumes(catalog, schema);
    if (!volumesRes.success) {
      return NextResponse.json(
        { error: volumesRes.error || "Gagal memuat folder penyimpanan Databricks" },
        { status: volumesRes.status || 500 }
      );
    }

    const databricksVolumes = volumesRes.data?.volumes || [];
    const allTemplates = await templateRepository.list();

    const matchingTemplates = allTemplates.filter(
      (t) =>
        t.volume.catalog.toLowerCase() === catalog.toLowerCase() &&
        t.volume.schema.toLowerCase() === schema.toLowerCase()
    );

    const templateByVolumeName = new Map<string, (typeof matchingTemplates)[0]>();
    for (const t of matchingTemplates) {
      templateByVolumeName.set(t.volume.name.toLowerCase(), t);
    }

    const volumeItems = [];

    for (const vol of databricksVolumes) {
      const volLower = vol.name.toLowerCase();
      const matched = templateByVolumeName.get(volLower);

      volumeItems.push({
        name: vol.name,
        catalog,
        schema,
        status: matched ? ("sudah_template" as const) : ("belum_template" as const),
        csvFiles: 0,
        parquetFiles: 0,
        unsupportedFormats: [],
        templateId: matched?.id,
        templateName: matched?.name,
      });
    }

    return NextResponse.json({
      catalog,
      schema,
      volumes: volumeItems,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
