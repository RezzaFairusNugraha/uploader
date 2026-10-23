import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/adminAuth";
import { runConnectionTest } from "@/lib/databricks";
import { readDecryptedSettings, saveTestResult } from "@/lib/settings";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("admin_session")?.value;
    if (!sessionCookie || !verifyAdminToken(sessionCookie)) {
      return NextResponse.json(
        { error: "Akses ditolak. Silakan masuk sebagai administrator." },
        { status: 401 }
      );
    }
    const settings = await readDecryptedSettings();
    if (!settings) {
      return NextResponse.json(
        {
          error:
            "Pengaturan belum disimpan atau token perlu dimasukkan ulang",
        },
        { status: 400 }
      );
    }

    const result = await runConnectionTest(settings);
    await saveTestResult(result);

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memproses pengujian koneksi",
      },
      { status: 500 }
    );
  }
}
