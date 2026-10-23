import { NextResponse } from "next/server";
import { templateRepository } from "@/lib/templates";

export async function POST(
  _request: Request,
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

    const archived = await templateRepository.archive(id);
    return NextResponse.json(archived);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal mengarsipkan template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
