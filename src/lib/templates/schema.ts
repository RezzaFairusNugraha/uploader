import { z } from "zod";

export const TemplateStatusSchema = z.enum([
  "draf",
  "membuat",
  "aktif",
  "gagal",
  "diarsipkan",
  "dihapus",
]);
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;

export const TemplateDelimiterSchema = z.enum([";", ","]);
export type TemplateDelimiter = z.infer<typeof TemplateDelimiterSchema>;

export const VolumeConfigSchema = z.object({
  catalog: z.string().min(1),
  schema: z.string().min(1),
  name: z.string().min(1),
});
export type VolumeConfig = z.infer<typeof VolumeConfigSchema>;

export const TextRuleSchema = z.object({
  type: z.literal("text"),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  allowedValues: z.array(z.string()).optional(),
});

export const IntegerRuleSchema = z.object({
  type: z.literal("integer"),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});

export const DigitsRuleSchema = z.object({
  type: z.literal("digits"),
  length: z.number().int().positive(),
});

export const DecimalRuleSchema = z.object({
  type: z.literal("decimal"),
  min: z.number().optional(),
  max: z.number().optional(),
  allowComma: z.boolean().optional(),
  allowDot: z.boolean().optional(),
  allowScientific: z.boolean().optional(),
  allowedText: z.array(z.string()).optional(),
});

export const DateRuleSchema = z.object({
  type: z.literal("date"),
  format: z.enum([
    "yyyy-MM-dd",
    "dd/MM/yyyy",
    "MM/dd/yyyy",
    "dd-MM-yyyy",
    "yyyy/MM/dd",
  ]),
});

export const ListRuleSchema = z.object({
  type: z.literal("list"),
  values: z.array(z.string()).min(1),
});

export const ColumnRuleSchema = z.discriminatedUnion("type", [
  TextRuleSchema,
  IntegerRuleSchema,
  DigitsRuleSchema,
  DecimalRuleSchema,
  DateRuleSchema,
  ListRuleSchema,
]);
export type ColumnRule = z.infer<typeof ColumnRuleSchema>;

export const columnNameRegex = /^[A-Za-z0-9_]{1,64}$/;

export const ColumnDefinitionSchema = z.object({
  name: z
    .string()
    .transform((val) => val.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(64)
        .regex(
          columnNameRegex,
          "Nama kolom harus 1-64 karakter dan hanya boleh berisi huruf, angka, atau underscore"
        )
    ),
  required: z.boolean(),
  rule: ColumnRuleSchema,
});
export type ColumnDefinition = z.infer<typeof ColumnDefinitionSchema>;

export const slugRegex = /^[a-z][a-z0-9_]{2,59}$/;

export function slugify(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return "tpl_data";
  }

  const prefixed = /^[a-z]/.test(normalized) ? normalized : `t_${normalized}`;
  return prefixed.slice(0, 60);
}

export const TemplateDefinitionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120),
    slug: z
      .string()
      .regex(
        slugRegex,
        "Slug harus 3-60 karakter, diawali huruf kecil, dan hanya berisi huruf kecil, angka, serta underscore"
      ),
    description: z.string().default(""),
    delimiter: TemplateDelimiterSchema,
    status: TemplateStatusSchema,
    volume: VolumeConfigSchema,
    schemaCreatedByApp: z.boolean().default(false),
    volumeCreatedByApp: z.boolean().default(false),
    workspaceHost: z.string().nullable().optional(),
    deletedAt: z.string().datetime().nullable().optional(),
    deletedBy: z.string().nullable().optional(),
    version: z.number().int().min(1).default(1),
    createdBy: z.string().nullable().optional(),
    updatedBy: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    columns: z.array(ColumnDefinitionSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.columns.length; i++) {
      const colName = data.columns[i].name;
      if (seen.has(colName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nama kolom '${colName}' tidak boleh duplikat`,
          path: ["columns", i, "name"],
        });
      }
      seen.add(colName);
    }
  });

export interface ProvisionStepStatus {
  step: "save_definition" | "create_schema" | "create_volume" | "create_csv" | "create_parquet" | "activate";
  name: string;
  status: "pending" | "running" | "success" | "error";
  message?: string;
  fix?: string;
}

export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
