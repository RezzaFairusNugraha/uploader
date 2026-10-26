import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createDatabricksClient } from "@/lib/databricks";
import { getConnectionState, readDecryptedSettings } from "@/lib/settings";
import { templateRepository } from "@/lib/templates/repository";
import { uploadLogRepository } from "@/lib/upload/log";

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

  if (template.status === "draf" && (!template.volume?.name || !template.volumeCreatedByApp)) {
    return NextResponse.json({
      csvFiles: 0,
      parquetFiles: 0,
      totalSize: 0,
      capped: false,
      lastUploadAt,
      uploadsLast7Days,
      volumeOwnedByApp: template.volumeCreatedByApp ?? false,
    });
  }

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
      { error: "Pengaturan koneksi ke penyimpanan data tidak lengkap." },
      { status: 503 }
    );
  }

  const client = createDatabricksClient(settings.workspaceUrl, settings.token);
  const volRes = await client.listVolumeContents(
    template.volume.name,
    template.volume.catalog,
    template.volume.schema
  );

  const summary = volRes.data || {
    csvFiles: 0,
    parquetFiles: 0,
    totalSize: 0,
    capped: false,
  };

  return NextResponse.json({
    csvFiles: summary.csvFiles,
    parquetFiles: summary.parquetFiles,
    totalSize: summary.totalSize,
    capped: summary.capped,
    lastUploadAt,
    uploadsLast7Days,
    volumeOwnedByApp: template.volumeCreatedByApp ?? false,
  });
}
