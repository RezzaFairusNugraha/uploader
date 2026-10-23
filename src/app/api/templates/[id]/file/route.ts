import { NextResponse } from "next/server";
import { generateTemplateCsv, templateRepository } from "@/lib/templates";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const template = await templateRepository.get(id);

  if (!template) {
    return NextResponse.json(
      { error: "Template tidak ditemukan" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const contoh = searchParams.get("contoh");
  const includeExample = contoh === "1";

  const csvContent = generateTemplateCsv(template, includeExample);
  const filename = `${template.slug}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
