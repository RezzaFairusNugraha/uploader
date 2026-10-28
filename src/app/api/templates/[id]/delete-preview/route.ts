import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";
import { uploadLogRepository } from "@/lib/upload/log";

export const dynamic = "force-dynamic";

export async function GET(
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
      { error: "Sesi admin diperlukan untuk melihat pratinjau hapus." },
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

  const logs = await uploadLogRepository.listByTemplate(id);
  const lastUploadAt = logs[0]?.createdAt || null;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const uploadsLast7Days = logs.filter(
    (l) => new Date(l.createdAt).getTime() >= sevenDaysAgo
  ).length;

  let summary = {
    csvFiles: 0,
    parquetFiles: 0,
    totalSize: 0,
    capped: false,
  };

  const toRemove: string[] = ["Definisi template"];
  const toKeep: string[] = [];

  try {
    const conn = await getConnectionState();
    if (conn.ready && template.volume?.name) {
      const settings = await readDecryptedSettings();
      if (settings?.workspaceUrl && settings?.token) {
        const client = createDatabricksClient(settings.workspaceUrl, settings.token);
        const volRes = await client.listVolumeContents(
          template.volume.name,
          template.volume.catalog,
          template.volume.schema,
          template.csvFolder,
          template.parquetFolder
        );
        if (volRes.data) {
          summary = volRes.data;
        }

        if (template.volumeCreatedByApp) {
          toRemove.push(`Folder penyimpanan '${template.volume.name}'`);
        } else {
          toKeep.push(`Folder penyimpanan '${template.volume.name}' (tidak dibuat oleh aplikasi)`);
        }

        if (template.schemaCreatedByApp && template.volume.catalog && template.volume.schema) {
          const vols = await client.listVolumes(template.volume.catalog, template.volume.schema);
          const otherVolumes = (vols.data?.volumes || []).filter(
            (v) => v.name !== template.volume?.name
          );
          const tables = await client.listTables(template.volume.catalog, template.volume.schema);
          const tableCount = tables.data?.tables?.length || 0;
          if (otherVolumes.length > 0 || tableCount > 0) {
            toKeep.push(`Folder induk '${template.volume.schema}' (masih berisi objek lain)`);
          } else {
            toRemove.push(`Folder induk '${template.volume.schema}'`);
          }
        } else if (template.volume.schema) {
          toKeep.push(`Folder induk '${template.volume.schema}' (tidak dibuat oleh aplikasi)`);
        }
      }
    } else {
      if (template.volume?.name) {
        if (template.volumeCreatedByApp) {
          toRemove.push(`Folder penyimpanan '${template.volume.name}'`);
        } else {
          toKeep.push(`Folder penyimpanan '${template.volume.name}' (tidak dibuat oleh aplikasi)`);
        }
      }
      if (template.volume?.schema) {
        if (template.schemaCreatedByApp) {
          toRemove.push(`Folder induk '${template.volume.schema}' (jika kosong)`);
        } else {
          toKeep.push(`Folder induk '${template.volume.schema}' (tidak dibuat oleh aplikasi)`);
        }
      }
    }
  } catch {
  }

  return NextResponse.json({
    csvFiles: summary.csvFiles,
    parquetFiles: summary.parquetFiles,
    totalSize: summary.totalSize,
    capped: summary.capped,
    lastUploadAt,
    uploadsLast7Days,
    volumeOwnedByApp: template.volumeCreatedByApp ?? false,
    schemaOwnedByApp: template.schemaCreatedByApp ?? false,
    toRemove,
    toKeep,
  });
}
