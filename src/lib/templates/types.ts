export type Rule =
  | { type: "digits"; length: number }
  | { type: "integerRange"; min: number; max: number }
  | { type: "integer" }
  | { type: "text" }
  | {
      type: "decimal";
      min: number;
      max: number;
      allowComma: boolean;
      allowDot: boolean;
    }
  | { type: "anyValue" };

export const rules = {
  digits: (length: number): Rule => ({ type: "digits", length }),
  integerRange: (min: number, max: number): Rule => ({
    type: "integerRange",
    min,
    max,
  }),
  integer: (): Rule => ({ type: "integer" }),
  text: (): Rule => ({ type: "text" }),
  decimal: (
    min: number,
    max: number,
    allowComma: boolean = true,
    allowDot: boolean = true
  ): Rule => ({
    type: "decimal",
    min,
    max,
    allowComma,
    allowDot,
  }),
  anyValue: (): Rule => ({ type: "anyValue" }),
};

export function formatRuleDescription(rule: Rule): string {
  switch (rule.type) {
    case "digits":
      return `${rule.length} digit angka`;
    case "integerRange":
      return `Bilangan bulat (${rule.min} - ${rule.max})`;
    case "integer":
      return "Bilangan bulat";
    case "text":
      return "Teks tidak boleh kosong";
    case "decimal":
      return `Desimal (${rule.min} - ${rule.max})`;
    case "anyValue":
      return "Nilai bebas";
  }
}

export interface ColumnDefinition {
  name: string;
  label: string;
  required: boolean;
  rule: Rule;
}

export type TemplateKind = "csv" | "csv-or-parquet";

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
  delimiter: string;
  fileNamePrefix: string;
  columns: ColumnDefinition[];
  exampleRows: string[][];
}

export function quoteCsvField(field: string, delimiter: string): string {
  const needsQuotes =
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes("\n") ||
    field.includes("\r") ||
    field.includes(",");

  if (!needsQuotes) {
    return field;
  }

  const escaped = field.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateCsv(
  template: TemplateConfig,
  sampleCount: number = 1
): string {
  if (template.columns.length === 0) {
    return "";
  }

  const header = template.columns
    .map((col) => quoteCsvField(col.name, template.delimiter))
    .join(template.delimiter);

  const rows = template.exampleRows.slice(0, Math.max(1, sampleCount));
  const renderedRows = rows.map((row) =>
    row
      .map((cell) => quoteCsvField(cell, template.delimiter))
      .join(template.delimiter)
  );

  return [header, ...renderedRows].join("\r\n") + "\r\n";
}
