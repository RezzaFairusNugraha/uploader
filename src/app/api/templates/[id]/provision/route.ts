import { NextResponse } from "next/server";
import { provisionTemplate } from "@/lib/templates/provision";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await provisionTemplate(id, {
      adoptExisting: Boolean(body?.adoptExisting || body?.reuseExistingVolume),
      reuseExistingVolume: Boolean(body?.reuseExistingVolume || body?.adoptExisting),
      catalog: body?.catalog,
      schema: body?.schema,
      volumeName: body?.volumeName,
      changedBy: body?.changedBy,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memproses provisi template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
