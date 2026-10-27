import { NextResponse } from "next/server";
import { templateVersionRepository } from "@/lib/templates/versions";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const items = await templateVersionRepository.listByTemplate(id);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat riwayat versi";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
