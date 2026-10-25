import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import {
  getConnectionState,
  readMaskedSettings,
  saveSettings,
  settingsFormSchema,
} from "@/lib/settings";

import { connection } from "next/server";

export async function GET() {
  await connection();
  const conn = await getConnectionState();
  const settings = await readMaskedSettings();
  if (conn.error) {
    return NextResponse.json({
      configured: false,
      error: conn.error,
      connection: conn,
    });
  }

  return NextResponse.json({
    configured: conn.ready,
    settings,
    connection: conn,
  });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("admin_session")?.value;
    if (!sessionCookie || !verifyAdminToken(sessionCookie)) {
      return NextResponse.json(
        { error: "Akses ditolak. Silakan masuk sebagai administrator." },
        { status: 401 }
      );
    }
    const json = await request.json();
    const parsed = settingsFormSchema.safeParse(json);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Data tidak valid";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const saved = await saveSettings(parsed.data);
    return NextResponse.json({ success: true, settings: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan pengaturan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
