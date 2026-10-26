import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";
import { templateVersionRepository } from "@/lib/templates/versions";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session: string | undefined;
  try {
    const cookieStore = await cookies();
    session = cookieStore.get("admin_session")?.value;
  } catch {
  }
  if (!session) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/admin_session=([^;]+)/);
    if (match) {
      session = match[1];
    }
  }

  if (!session || !verifyAdminToken(session)) {
    return NextResponse.json(
      { error: "Sesi admin diperlukan untuk menghapus template." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const template = await templateRepository.get(id);
  if (!template) {
    return NextResponse.json(
      { error: "Template tidak ditemukan." },
      { status: 404 }
    );
  }

  if (template.status !== "diarsipkan" && template.status !== "draf") {
    return NextResponse.json(
      { error: "Hanya template berstatus Nonaktif atau Draf yang dapat dihapus." },
      { status: 400 }
    );
  }

  let body: { confirmName?: string; deletedBy?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  const { confirmName, deletedBy } = body;
  if (!confirmName || confirmName.trim() !== template.name.trim()) {
    return NextResponse.json(
      { error: "Nama konfirmasi tidak sesuai dengan nama template." },
      { status: 400 }
    );
  }

  const finalDeletedBy = deletedBy && deletedBy.trim()
    ? `${deletedBy.trim()} (Admin)`
    : "Admin";

  if (template.status === "draf" && !template.volumeCreatedByApp) {
    const deleted = await templateRepository.markDeleted(id, finalDeletedBy);
    await templateVersionRepository.add({
      templateId: id,
      version: deleted.version,
      snapshot: deleted,
      changeSummary: "Template draf dihapus.",
      isBreaking: true,
      changedBy: finalDeletedBy,
    });

    return NextResponse.json({
      success: true,
      message: `Template ${template.name} dihapus permanen`,
    });
  }

  if (template.volumeCreatedByApp) {
    const conn = await getConnectionState();
    if (!conn.ready) {
      return NextResponse.json(
        { error: "Koneksi ke penyimpanan data belum siap. Hubungi admin." },
        { status: 503 }
      );
    }

    const settings = await readDecryptedSettings();
    if (!settings || !settings.workspaceUrl || !settings.token) {
      return NextResponse.json(
        { error: "Pengaturan koneksi tidak lengkap." },
        { status: 503 }
      );
    }

    const client = createDatabricksClient(settings.workspaceUrl, settings.token);
    const volRes = await client.listVolumeContents(
      template.volume.name,
      template.volume.catalog,
      template.volume.schema
    );
    const summary = volRes.data || { totalFiles: 0, totalSize: 0 };

    const fullName = `${template.volume.catalog}.${template.volume.schema}.${template.volume.name}`;
    const delRes = await client.deleteVolume(fullName);

    if (!delRes.success && delRes.status !== 404) {
      return NextResponse.json(
        { error: `${delRes.error || "Gagal menghapus folder penyimpanan di Databricks"}. Coba lagi.` },
        { status: delRes.status === 403 ? 403 : 500 }
      );
    }

    const deleted = await templateRepository.markDeleted(id, finalDeletedBy);
    const sizeStr = formatBytes(summary.totalSize);
    const fileStr = `${summary.totalFiles} file, ${sizeStr}`;

    await templateVersionRepository.add({
      templateId: id,
      version: deleted.version,
      snapshot: deleted,
      changeSummary: `Template dihapus permanen beserta folder penyimpanan (${fileStr})`,
      isBreaking: true,
      changedBy: finalDeletedBy,
    });

    return NextResponse.json({
      success: true,
      message: `Template ${template.name} dihapus permanen`,
    });
  } else {
    const deleted = await templateRepository.markDeleted(id, finalDeletedBy);
    await templateVersionRepository.add({
      templateId: id,
      version: deleted.version,
      snapshot: deleted,
      changeSummary:
        "Template dihapus. Folder penyimpanan tidak ikut dihapus karena tidak dibuat oleh aplikasi.",
      isBreaking: true,
      changedBy: finalDeletedBy,
    });

    return NextResponse.json({
      success: true,
      message: `Template ${template.name} dihapus permanen`,
    });
  }
}
