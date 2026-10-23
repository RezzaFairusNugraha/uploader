import { NextResponse } from "next/server";
import { readMaskedSettings } from "@/lib/settings";

export async function GET() {
  const missingEnv: string[] = [];
  if (!process.env.DATABASE_URL) {
    missingEnv.push("DATABASE_URL");
  }
  if (!process.env.DIRECT_DATABASE_URL) {
    missingEnv.push("DIRECT_DATABASE_URL");
  }
  if (!process.env.ENCRYPTION_KEY) {
    missingEnv.push("ENCRYPTION_KEY");
  }

  if (missingEnv.length > 0) {
    return NextResponse.json({
      configured: false,
      status: "env_missing",
      missingEnv,
      error: `Variabel lingkungan belum lengkap: ${missingEnv.join(", ")}. Konfigurasikan di environment deployment.`,
    });
  }

  const settings = await readMaskedSettings();
  if (!settings || !settings.hasToken) {
    return NextResponse.json({
      configured: false,
      status: "unconfigured",
      missingEnv: [],
    });
  }

  let status: "unconfigured" | "connected" | "failed" = "unconfigured";
  if (settings.lastTestResult) {
    status = settings.lastTestResult.success ? "connected" : "failed";
  }

  return NextResponse.json({
    configured: true,
    status,
    missingEnv: [],
  });
}
