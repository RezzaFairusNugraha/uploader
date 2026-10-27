import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";

export const dynamic = "force-dynamic";

export interface CheckConnectionItemResult {
  templateId: string;
  templateName: string;
  volumeName: string;
  status: "ditemukan" | "tidak ditemukan" | "tidak ada izin";
}

export async function GET() {
  try {
    const allTemplates = await templateRepository.list();
    const flagged = allTemplates.filter(
      (t) => t.needsCheck || t.visibility === "tidak_terlihat"
    );
    return NextResponse.json({
      templates: flagged.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        volume: t.volume,
        needsCheck: t.needsCheck,
        visibility: t.visibility,
      })),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat template yang perlu diperiksa";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const templateId =
      typeof body.templateId === "string" && body.templateId.trim()
        ? body.templateId.trim()
        : searchParams.get("templateId");

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
    const currentCatalog = settings.catalog || "main";
    const currentSchema = settings.schema || "default";

    if (templateId) {
      const template = await templateRepository.get(templateId);
      if (!template) {
        return NextResponse.json(
          { error: "Template tidak ditemukan" },
          { status: 404 }
        );
      }

      const cat = template.volume?.catalog || currentCatalog;
      const sch = template.volume?.schema || currentSchema;
      const volName = template.volume?.name || template.slug;

      const volRes = await client.getVolume(cat, sch, volName);
      let status: "ditemukan" | "tidak ditemukan" | "tidak ada izin" = "tidak ditemukan";

      if (volRes.success) {
        status = "ditemukan";
        await templateRepository.update(template.id, {
          workspaceHost: currentHost,
          needsCheck: false,
          visibility: "terlihat",
          visibilityCheckedAt: new Date().toISOString(),
        });
      } else if (volRes.status === 403) {
        status = "tidak ada izin";
      }

      const result: CheckConnectionItemResult = {
        templateId: template.id,
        templateName: template.name,
        volumeName: volName,
        status,
      };

      return NextResponse.json({
        success: true,
        currentHost,
        totalChecked: 1,
        results: [result],
        result,
      });
    }

    const allTemplates = await templateRepository.list();
    const flaggedTemplates = allTemplates.filter(
      (t) => t.needsCheck || t.visibility === "tidak_terlihat"
    );

    if (flaggedTemplates.length === 0) {
      return NextResponse.json({
        success: true,
        currentHost,
        totalChecked: 0,
        results: [],
      });
    }

    const target = flaggedTemplates[0];
    const cat = target.volume?.catalog || currentCatalog;
    const sch = target.volume?.schema || currentSchema;
    const volName = target.volume?.name || target.slug;

    const volRes = await client.getVolume(cat, sch, volName);
    let status: "ditemukan" | "tidak ditemukan" | "tidak ada izin" = "tidak ditemukan";

    if (volRes.success) {
      status = "ditemukan";
      await templateRepository.update(target.id, {
        workspaceHost: currentHost,
        needsCheck: false,
        visibility: "terlihat",
        visibilityCheckedAt: new Date().toISOString(),
      });
    } else if (volRes.status === 403) {
      status = "tidak ada izin";
    }

    const result: CheckConnectionItemResult = {
      templateId: target.id,
      templateName: target.name,
      volumeName: volName,
      status,
    };

    return NextResponse.json({
      success: true,
      currentHost,
      totalChecked: 1,
      results: [result],
      result,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memeriksa koneksi template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
