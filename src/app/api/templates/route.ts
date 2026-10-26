import { NextResponse, connection } from "next/server";
import { z } from "zod";
import {
  ColumnDefinitionSchema,
  TemplateDelimiterSchema,
  TemplateDefinitionSchema,
  VolumeConfigSchema,
  templateRepository,
  slugify,
  type TemplateDefinition,
} from "@/lib/templates";

const CreateTemplateBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().optional(),
  description: z.string().optional().default(""),
  delimiter: TemplateDelimiterSchema,
  volume: VolumeConfigSchema,
  columns: z.array(ColumnDefinitionSchema).default([]),
});

export async function GET() {
  await connection();
  const templates = await templateRepository.list();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = CreateTemplateBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data template tidak valid", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, description, delimiter, volume, columns } = parsed.data;
    const slug = parsed.data.slug?.trim() || slugify(name);
    const now = new Date().toISOString();

    const newTemplate: TemplateDefinition = {
      id: crypto.randomUUID(),
      name,
      slug,
      description: description || "",
      delimiter,
      status: "membuat",
      volume,
      version: 1,
      createdAt: now,
      updatedAt: now,
      columns,
    };

    const validated = TemplateDefinitionSchema.safeParse(newTemplate);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Definisi template tidak valid", issues: validated.error.issues },
        { status: 400 }
      );
    }

    const created = await templateRepository.create(validated.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal membuat template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
