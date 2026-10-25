import { NextResponse, connection } from "next/server";
import { getConnectionState, readMaskedSettings } from "@/lib/settings";

export async function GET() {
  await connection();
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
      missing: [],
      error: `Variabel lingkungan belum lengkap: ${missingEnv.join(", ")}. Konfigurasikan di environment deployment.`,
    });
  }

  const conn = await getConnectionState();
  if (conn.error) {
    return NextResponse.json({
      configured: false,
      status: "unconfigured",
      missingEnv: [],
      missing: [],
      error: conn.error,
    });
  }

  const settings = await readMaskedSettings();
  let status: "unconfigured" | "connected" | "failed" = "unconfigured";
  if (conn.ready) {
    status = settings?.lastTestResult ? (settings.lastTestResult.success ? "connected" : "failed") : "connected";
  }

  return NextResponse.json({
    configured: conn.ready,
    status,
    missingEnv: [],
    missing: conn.missing,
    error: null,
  });
}
