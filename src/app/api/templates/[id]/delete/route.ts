import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";
import { templateVersionRepository } from "@/lib/templates/versions";

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

  if (
    template.status !== "diarsipkan" &&
    template.status !== "draf" &&
    template.status !== "draf_deteksi" &&
    template.status !== "gagal" &&
    template.status !== "membuat"
  ) {
    return NextResponse.json(
      { error: "Hanya template berstatus Nonaktif, Draf, atau belum aktif yang dapat dihapus." },
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

  const finalDeletedBy =
    deletedBy && deletedBy.trim() ? `${deletedBy.trim()} (Admin)` : "Admin";

  let schemaNotice: string | undefined;

  try {
    const conn = await getConnectionState();
    if (conn.ready && template.volume?.catalog && template.volume?.schema) {
      const settings = await readDecryptedSettings();
      if (settings?.workspaceUrl && settings?.token) {
        const client = createDatabricksClient(settings.workspaceUrl, settings.token);

        if (template.volumeCreatedByApp && template.volume.name) {
          const volumeFullName = `${template.volume.catalog}.${template.volume.schema}.${template.volume.name}`;
          await client.deleteVolume(volumeFullName);
        }

        if (template.schemaCreatedByApp) {
          const isEmpty = await client.isSchemaEmpty(
            template.volume.catalog,
            template.volume.schema
          );
          if (isEmpty) {
            const schemaFullName = `${template.volume.catalog}.${template.volume.schema}`;
            await client.deleteSchema(schemaFullName);
          } else {
            schemaNotice = "Folder induk tidak dihapus karena masih berisi objek lain.";
          }
        }
      }
    }
  } catch {
  }

  let changeSummary = `Template ${template.name} dihapus permanen.`;
  if (schemaNotice) {
    changeSummary += ` ${schemaNotice}`;
  } else if (!template.volumeCreatedByApp) {
    changeSummary += " Folder penyimpanan tidak ikut dihapus karena tidak dibuat oleh aplikasi.";
  }

  const deleted = await templateRepository.markDeleted(id, finalDeletedBy);
  await templateVersionRepository.add({
    templateId: id,
    version: deleted.version,
    snapshot: deleted,
    changeSummary,
    isBreaking: true,
    changedBy: finalDeletedBy,
  });

  return NextResponse.json({
    success: true,
    message: schemaNotice
      ? `Template ${template.name} dihapus permanen. ${schemaNotice}`
      : `Template ${template.name} dihapus permanen`,
    notice: schemaNotice,
  });
}
