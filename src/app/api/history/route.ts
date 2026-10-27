import { NextResponse } from "next/server";
import { uploadLogRepository } from "@/lib/upload/log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await uploadLogRepository.listRecent(50);
    return NextResponse.json({ items: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memuat riwayat pengunggahan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
