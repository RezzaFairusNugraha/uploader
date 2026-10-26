import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";

export interface CheckConnectionItemResult {
  templateId: string;
  templateName: string;
  volumeName: string;
  status: "ditemukan" | "tidak ditemukan" | "tidak ada izin";
}

export async function POST() {
  try {
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
    const flaggedTemplates = allTemplates.filter(
      (t) => t.needsCheck || t.visibility === "tidak_terlihat"
    );

    const currentCatalog = settings.catalog || "main";
    const currentSchema = settings.schema || "default";
    const results: CheckConnectionItemResult[] = [];

    for (const t of flaggedTemplates) {
      const cat = t.volume?.catalog || currentCatalog;
      const sch = t.volume?.schema || currentSchema;
      const volName = t.volume?.name || t.slug;

      const volRes = await client.getVolume(cat, sch, volName);

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
          volumeName: volName,
          status: "ditemukan",
        });
      } else if (volRes.status === 403) {
        results.push({
          templateId: t.id,
          templateName: t.name,
          volumeName: volName,
          status: "tidak ada izin",
        });
      } else {
        results.push({
          templateId: t.id,
          templateName: t.name,
          volumeName: volName,
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
    const message =
      err instanceof Error ? err.message : "Gagal memeriksa koneksi template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
