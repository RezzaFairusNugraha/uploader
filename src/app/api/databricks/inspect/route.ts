import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { inspectVolume } from "@/lib/databricks/inspect";
import { readDecryptedSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { catalog, schema, volume } = body;

    if (!catalog || !schema || !volume) {
      return NextResponse.json(
        { error: "Katalog, skema, dan nama folder penyimpanan wajib diisi" },
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

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const result = await inspectVolume(client, catalog, schema, volume);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan saat memeriksa folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
