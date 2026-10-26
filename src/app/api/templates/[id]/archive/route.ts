import { NextResponse } from "next/server";
import { templateRepository } from "@/lib/templates";
import { templateVersionRepository } from "@/lib/templates/versions";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await templateRepository.get(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    let changedBy = "Pengguna";
    try {
      const body = await request.json();
      if (body?.changedBy) changedBy = String(body.changedBy).trim();
    } catch {}

    const archived = await templateRepository.updateStatus(id, "diarsipkan");

    await templateVersionRepository.add({
      templateId: archived.id,
      version: archived.version,
      snapshot: archived,
      changeSummary: "Template dinonaktifkan",
      isBreaking: false,
      changedBy,
    });

    return NextResponse.json(archived);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal mengarsipkan template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
