import { NextResponse } from "next/server";
import { runConnectionTest } from "@/lib/databricks";
import { readDecryptedSettings, saveTestResult } from "@/lib/settings";

export async function POST() {
  try {
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
