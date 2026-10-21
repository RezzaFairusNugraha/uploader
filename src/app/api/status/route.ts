import { NextResponse } from "next/server";
import { readRawSettings } from "@/lib/settings";

export async function GET() {
  const settings = await readRawSettings();
  if (!settings) {
    return NextResponse.json({
      configured: false,
      status: "unconfigured",
    });
  }

  let status: "unconfigured" | "connected" | "failed" = "unconfigured";
  if (settings.lastTestResult) {
    status = settings.lastTestResult.success ? "connected" : "failed";
  }

  return NextResponse.json({
    configured: true,
    status,
  });
}
