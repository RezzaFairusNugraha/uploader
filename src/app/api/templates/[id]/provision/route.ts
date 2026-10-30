import { NextResponse } from "next/server";
import { provisionTemplate } from "@/lib/templates/provision";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await provisionTemplate(id);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memproses provisi template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
