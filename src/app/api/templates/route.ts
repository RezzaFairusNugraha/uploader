import { NextResponse, connection } from "next/server";
import { z } from "zod";
import {
  ColumnDefinitionSchema,
  TemplateDelimiterSchema,
  TemplateDefinitionSchema,
  VolumeConfigSchema,
  templateRepository,
  slugify,
  validateSchemaName,
  validateVolumeName,
  type TemplateDefinition,
} from "@/lib/templates";

const CreateTemplateBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().optional(),
  description: z.string().optional().default(""),
  delimiter: TemplateDelimiterSchema,
  volume: VolumeConfigSchema,
  csvFolder: z.string().optional().default("csv"),
  parquetFolder: z.string().optional().default("parquet"),
  columns: z.array(ColumnDefinitionSchema).default([]),
});

export const dynamic = "force-dynamic";

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

    const { name, description, delimiter, volume, columns, csvFolder, parquetFolder } = parsed.data;
    const slug = parsed.data.slug?.trim() || slugify(name);

    const schemaCheck = validateSchemaName(volume.schema || slug);
    if (!schemaCheck.valid) {
      return NextResponse.json({ error: schemaCheck.error }, { status: 400 });
    }

    const volumeNameCheck = validateVolumeName(volume.name);
    if (!volumeNameCheck.valid) {
      return NextResponse.json({ error: volumeNameCheck.error }, { status: 400 });
    }

    const now = new Date().toISOString();

    const newTemplate: TemplateDefinition = {
      id: crypto.randomUUID(),
      name,
      slug,
      description: description || "",
      delimiter,
      status: "membuat",
      volume,
      schemaCreatedByApp: false,
      volumeCreatedByApp: false,
      csvFolder,
      parquetFolder,
      needsCheck: false,
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
