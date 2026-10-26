import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
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

  const changeSummary = template.volumeCreatedByApp
    ? "Template dihapus. Folder penyimpanan di Databricks tetap dipertahankan."
    : "Template dihapus. Folder penyimpanan tidak ikut dihapus karena tidak dibuat oleh aplikasi.";

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
    message: `Template ${template.name} dihapus permanen`,
  });
}
