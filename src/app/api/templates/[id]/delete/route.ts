import { NextResponse } from "next/server";
import { createDatabricksClient } from "@/lib/databricks";
import { templateRepository } from "@/lib/templates/repository";
import { templateVersionRepository } from "@/lib/templates/versions";
import { getDatabricksConfig } from "@/platform/config";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    deletedBy && deletedBy.trim() ? deletedBy.trim() : "Pengguna";

  let schemaNotice: string | undefined;

  const dbConfig = getDatabricksConfig();
  if (dbConfig && template.volume?.catalog && template.volume?.schema) {
    try {
      const client = createDatabricksClient(dbConfig.host, dbConfig.token);

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
    } catch {
    }
  }

  await templateVersionRepository.add({
    templateId: template.id,
    version: template.version,
    snapshot: template,
    changeSummary: `Template dihapus permanen oleh ${finalDeletedBy}`,
    isBreaking: true,
    changedBy: finalDeletedBy,
  });

  await templateRepository.markDeleted(id, finalDeletedBy);

  return NextResponse.json({
    success: true,
    message: "Template berhasil dihapus permanen.",
    notice: schemaNotice,
  });
}
