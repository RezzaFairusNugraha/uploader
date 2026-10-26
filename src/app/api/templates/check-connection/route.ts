import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";

export interface CheckConnectionItemResult {
  templateId: string;
  templateName: string;
  volumeName: string;
  status: "ditemukan" | "tidak ditemukan" | "tidak ada izin";
}

export async function POST(request: Request) {
  try {
    let session: string | undefined;
    try {
      const cookieStore = await cookies();
      session = cookieStore.get("admin_session")?.value;
    } catch {}

    if (!session) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/admin_session=([^;]+)/);
      if (match) {
        session = match[1];
      }
    }

    if (!session || !verifyAdminToken(session)) {
      return NextResponse.json(
        { error: "Sesi admin diperlukan untuk memeriksa koneksi template." },
        { status: 401 }
      );
    }

    const settings = await readDecryptedSettings();
    if (!settings || !settings.workspaceUrl || !settings.token) {
      return NextResponse.json(
        { error: "Koneksi Databricks belum dikonfigurasi. Hubungi admin." },
        { status: 400 }
      );
    }

    const currentHost = settings.workspaceUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const allTemplates = await templateRepository.list();
    const flaggedTemplates = allTemplates.filter((t) => t.needsCheck);

    const results: CheckConnectionItemResult[] = [];

    for (const t of flaggedTemplates) {
      const volRes = await client.getVolume(
        t.volume.catalog,
        t.volume.schema,
        t.volume.name
      );

      if (volRes.success) {
        await templateRepository.update(t.id, {
          workspaceHost: currentHost,
          needsCheck: false,
          visibility: "terlihat",
          visibilityCheckedAt: new Date().toISOString(),
        });
        results.push({
          templateId: t.id,
          templateName: t.name,
          volumeName: t.volume.name,
          status: "ditemukan",
        });
      } else if (volRes.status === 403) {
        results.push({
          templateId: t.id,
          templateName: t.name,
          volumeName: t.volume.name,
          status: "tidak ada izin",
        });
      } else {
        results.push({
          templateId: t.id,
          templateName: t.name,
          volumeName: t.volume.name,
          status: "tidak ditemukan",
        });
      }
    }

    return NextResponse.json({
      success: true,
      currentHost,
      totalChecked: flaggedTemplates.length,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan saat memeriksa template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
