import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { USER_COPY } from "@/lib/copy";
import { getDatabricksConfig } from "@/platform/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dbConfig = getDatabricksConfig();
    if (!dbConfig) {
      return NextResponse.json(
        { error: USER_COPY.connection.notConnected },
        { status: 400 }
      );
    }

    const client = createDatabricksClient(dbConfig.host, dbConfig.token);
    const catalogParam = searchParams.get("catalog");

    let catalogs: string[] = [];
    const catRes = await client.listCatalogs();
    if (catRes.success && catRes.data?.catalogs) {
      catalogs = catRes.data.catalogs.map((c) => c.name);
    }
    if (dbConfig.catalog && !catalogs.includes(dbConfig.catalog)) {
      catalogs.unshift(dbConfig.catalog);
    }

    const selectedCatalog = catalogParam || dbConfig.catalog || catalogs[0] || "";
    let schemas: string[] = [];

    if (selectedCatalog) {
      const schRes = await client.listSchemas(selectedCatalog);
      if (schRes.success && schRes.data?.schemas) {
        schemas = schRes.data.schemas.map((s) => s.name);
      }
    }

    return NextResponse.json({
      catalogs,
      schemas,
      defaultCatalog: dbConfig.catalog,
      defaultSchema: "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
