import { NextResponse } from "next/server";
import { generateCsv, getTemplateById } from "@/lib/templates";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const template = getTemplateById(id);

  if (!template) {
    return NextResponse.json(
      { error: "Template tidak ditemukan" },
      { status: 404 }
    );
  }

  if (template.kind === "csv-or-parquet" || template.columns.length === 0) {
    return NextResponse.json(
      { error: "Belum ada template untuk data riset" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const contoh = searchParams.get("contoh");
  const sampleCount = contoh === "1" ? 3 : 1;

  const csvContent = generateCsv(template, sampleCount);
  const filename = `${template.id}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
