import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ColumnDefinitionSchema,
  TemplateDelimiterSchema,
  TemplateStatusSchema,
  VolumeConfigSchema,
  templateRepository,
} from "@/lib/templates";

const UpdateTemplateBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  delimiter: TemplateDelimiterSchema.optional(),
  status: TemplateStatusSchema.optional(),
  volume: VolumeConfigSchema.optional(),
  columns: z.array(ColumnDefinitionSchema).optional(),
});

export async function GET(
  _request: Request,
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

  return NextResponse.json(template);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await templateRepository.get(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan" },
        { status: 404 }
      );
    }

    const rawBody = await request.json();
    const parsed = UpdateTemplateBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Perubahan template tidak valid", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await templateRepository.update(id, parsed.data);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memperbarui template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
