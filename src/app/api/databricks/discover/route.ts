import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates";

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
    const schema = searchParams.get("schema") || settings.schema || "";

    if (!catalog || !schema) {
      return NextResponse.json(
        { error: "Katalog dan skema Databricks wajib ditentukan" },
        { status: 400 }
      );
    }

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
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

    const templateByVolumeName = new Map<string, typeof matchingTemplates[0]>();
    for (const t of matchingTemplates) {
      templateByVolumeName.set(t.volume.name.toLowerCase(), t);
    }

    const seenVolumeNames = new Set<string>();
    const volumeItems = [];

    for (const vol of databricksVolumes) {
      const volLower = vol.name.toLowerCase();
      seenVolumeNames.add(volLower);
      const matched = templateByVolumeName.get(volLower);

      let csvFiles = 0;
      let parquetFiles = 0;
      const unsupportedMap = new Map<string, number>();

      const rootRes = await client.listDirectory(`/Volumes/${catalog}/${schema}/${vol.name}`);
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

      volumeItems.push({
        name: vol.name,
        catalog,
        schema,
        status,
        csvFiles,
        parquetFiles,
        unsupportedFormats,
        templateId: matched?.id,
        templateName: matched?.name,
      });
    }

    const tidakTerlihat = matchingTemplates
      .filter((t) => !seenVolumeNames.has(t.volume.name.toLowerCase()))
      .map((t) => ({
        templateId: t.id,
        templateName: t.name,
        volumeName: t.volume.name,
        catalog: t.volume.catalog,
        schema: t.volume.schema,
        status: "tidak_terlihat" as const,
      }));

    return NextResponse.json({
      catalog,
      schema,
      volumes: volumeItems,
      tidakTerlihat,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
