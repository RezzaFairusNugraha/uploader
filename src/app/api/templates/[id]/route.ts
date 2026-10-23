import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ColumnDefinitionSchema,
  TemplateDelimiterSchema,
  TemplateStatusSchema,
  VolumeConfigSchema,
  templateRepository,
} from "@/lib/templates";
import { diffTemplates } from "@/lib/templates/diff";
import { templateVersionRepository } from "@/lib/templates/versions";

const UpdateTemplateBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  delimiter: TemplateDelimiterSchema.optional(),
  status: TemplateStatusSchema.optional(),
  volume: VolumeConfigSchema.optional(),
  columns: z.array(ColumnDefinitionSchema).optional(),
  changedBy: z.string().optional(),
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

    const { changedBy, ...patchData } = parsed.data;
    const updated = await templateRepository.update(id, patchData);

    const diff = diffTemplates(existing, updated);
    await templateVersionRepository.add({
      templateId: updated.id,
      version: updated.version,
      snapshot: updated,
      changeSummary: diff.summary || "Pembaruan template",
      isBreaking: diff.isBreaking,
      changedBy: changedBy?.trim() || "Pengguna",
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memperbarui template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
