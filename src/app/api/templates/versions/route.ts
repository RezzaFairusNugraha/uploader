import { NextResponse } from "next/server";
import { templateVersionRepository } from "@/lib/templates/versions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await templateVersionRepository.latestAcrossTemplates(50);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat riwayat perubahan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
