import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";

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

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const catalogParam = searchParams.get("catalog");

    let catalogs: string[] = [];
    const catRes = await client.listCatalogs();
    if (catRes.success && catRes.data?.catalogs) {
      catalogs = catRes.data.catalogs.map((c) => c.name);
    }
    if (settings.catalog && !catalogs.includes(settings.catalog)) {
      catalogs.unshift(settings.catalog);
    }

    const selectedCatalog = catalogParam || settings.catalog || catalogs[0] || "";
    let schemas: string[] = [];

    if (selectedCatalog) {
      const schRes = await client.listSchemas(selectedCatalog);
      if (schRes.success && schRes.data?.schemas) {
        schemas = schRes.data.schemas.map((s) => s.name);
      }
      if (
        selectedCatalog === settings.catalog &&
        settings.schema &&
        !schemas.includes(settings.schema)
      ) {
        schemas.unshift(settings.schema);
      }
    }

    return NextResponse.json({
      catalogs,
      schemas,
      defaultCatalog: settings.catalog,
      defaultSchema: settings.schema,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
