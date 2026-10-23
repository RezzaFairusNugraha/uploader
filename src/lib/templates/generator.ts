import type { ColumnRule, TemplateDefinition } from "./schema";

function quoteCsvField(field: string, delimiter: string): string {
  const needsQuotes =
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes("\n") ||
    field.includes("\r");

  if (!needsQuotes) {
    return field;
  }

  const escaped = field.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateExampleValue(rule: ColumnRule): string {
  switch (rule.type) {
    case "text":
      if (rule.allowedValues && rule.allowedValues.length > 0) {
        return rule.allowedValues[0];
      }
      return "Contoh Teks";
    case "integer":
      if (rule.min !== undefined && rule.max !== undefined) {
        return String(Math.floor((rule.min + rule.max) / 2));
      }
      if (rule.min !== undefined) {
        return String(rule.min);
      }
      if (rule.max !== undefined) {
        return String(rule.max);
      }
      return "100";
    case "digits":
      return "1".repeat(rule.length);
    case "decimal":
      if (rule.allowedText && rule.allowedText.length > 0) {
        return rule.allowedText[0];
      }
      if (rule.min !== undefined) {
        return rule.allowComma ? String(rule.min).replace(".", ",") : String(rule.min);
      }
      return rule.allowComma ? "10,5" : "10.5";
    case "date":
      switch (rule.format) {
        case "yyyy-MM-dd":
          return "2026-01-31";
        case "dd/MM/yyyy":
          return "31/01/2026";
        case "MM/dd/yyyy":
          return "01/31/2026";
        case "dd-MM-yyyy":
          return "31-01-2026";
        case "yyyy/MM/dd":
          return "2026/01/31";
      }
      break;
    case "list":
      return rule.values[0] || "";
  }
}

export function generateTemplateCsv(
  template: TemplateDefinition,
  includeExample: boolean = false
): string {
  if (template.columns.length === 0) {
    return "";
  }

  const header = template.columns
    .map((col) => quoteCsvField(col.name, template.delimiter))
    .join(template.delimiter);

  if (!includeExample) {
    return `${header}\r\n`;
  }

  const exampleRow = template.columns
    .map((col) => {
      const val = generateExampleValue(col.rule);
      return quoteCsvField(val, template.delimiter);
    })
    .join(template.delimiter);

  return `${header}\r\n${exampleRow}\r\n`;
}
