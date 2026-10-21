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

  const csvContent = generateCsv(template, 1);
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
