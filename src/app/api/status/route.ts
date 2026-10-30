import { NextResponse } from "next/server";
import { getConfigStatus } from "@/platform/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getConfigStatus();
  return NextResponse.json(status);
}
