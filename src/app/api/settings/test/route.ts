import { NextResponse } from "next/server";
import { runConnectionTest } from "@/lib/databricks";
import { readDecryptedSettings, saveTestResult } from "@/lib/settings";

export async function POST() {
  const settings = await readDecryptedSettings();
  if (!settings) {
    return NextResponse.json(
      { error: "Pengaturan belum disimpan" },
      { status: 400 }
    );
  }

  const result = await runConnectionTest(settings);
  await saveTestResult(result);

  return NextResponse.json({
    success: result.success,
    result,
  });
}
