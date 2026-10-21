import type { ColumnDefinition } from "../templates";
import type { ValidationIssue } from "./types";

function truncateValue(value: string): string {
  return value.length > 40 ? `${value.slice(0, 37)}...` : value;
}

export function validateCell(
  rawValue: string,
  column: ColumnDefinition,
  line: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmed = rawValue.trim();
  const truncated = truncateValue(rawValue);

  if (column.required && trimmed.length === 0) {
    issues.push({
      level: "error",
      code: "REQUIRED_FIELD_EMPTY",
      line,
      column: column.name,
      value: truncated,
      message: `Kolom '${column.name}' wajib diisi.`,
    });
    return issues;
  }

  if (trimmed.length === 0) {
    return issues;
  }

  const { rule } = column;

  switch (rule.type) {
    case "digits": {
      const isDigits = /^\d+$/.test(trimmed);
      if (!isDigits || trimmed.length !== rule.length) {
        issues.push({
          level: "error",
          code: "INVALID_DIGITS",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus terdiri dari ${rule.length} digit angka.`,
        });
      }
      break;
    }

    case "integerRange": {
      const isInteger = /^-?\d+$/.test(trimmed);
      if (!isInteger) {
        issues.push({
          level: "error",
          code: "INVALID_INTEGER",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berupa bilangan bulat.`,
        });
        break;
      }

      const num = parseInt(trimmed, 10);
      if (num < rule.min || num > rule.max) {
        issues.push({
          level: "error",
          code: "INVALID_INTEGER_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berupa bilangan bulat antara ${rule.min} dan ${rule.max}.`,
        });
      }
      break;
    }

    case "integer": {
      const isInteger = /^-?\d+$/.test(trimmed);
      if (!isInteger) {
        issues.push({
          level: "error",
          code: "INVALID_INTEGER",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berupa bilangan bulat.`,
        });
      }
      break;
    }

    case "text": {
      if (trimmed.length === 0) {
        issues.push({
          level: "error",
          code: "INVALID_TEXT",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak boleh kosong.`,
        });
      }
      break;
    }

    case "decimal": {
      const hasComma = trimmed.includes(",");
      const hasDot = trimmed.includes(".");

      if (hasComma && hasDot) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Format angka pada kolom '${column.name}' tidak valid.`,
        });
        break;
      }

      if (hasDot && !rule.allowDot) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak boleh menggunakan titik sebagai pemisah desimal.`,
        });
        break;
      }

      if (hasComma && !rule.allowComma) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak boleh menggunakan koma sebagai pemisah desimal.`,
        });
        break;
      }

      const normalized = trimmed.replace(",", ".");
      const isDecimal = /^-?\d+(\.\d+)?$/.test(normalized);

      if (!isDecimal) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berupa angka desimal yang valid.`,
        });
        break;
      }

      const num = parseFloat(normalized);
      if (isNaN(num) || num < rule.min || num > rule.max) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus bernilai antara ${rule.min} dan ${rule.max}.`,
        });
      }
      break;
    }

    case "numericOrText": {
      if (rule.allowedText.includes(trimmed)) {
        break;
      }

      const isNumeric = /^-?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(trimmed);
      if (!isNumeric) {
        const textOptions = rule.allowedText.map((t) => `'${t}'`).join(" atau ");
        issues.push({
          level: "error",
          code: "INVALID_NUMERIC_OR_TEXT",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berupa angka (bilangan bulat, desimal titik/koma, atau notasi ilmiah) atau teks ${textOptions}.`,
        });
        break;
      }

      const normalized = trimmed.replace(",", ".");
      const val = Number(normalized);
      if (isNaN(val) || (rule.min !== undefined && val < rule.min)) {
        issues.push({
          level: "error",
          code: "INVALID_NUMERIC_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus bernilai minimal ${rule.min ?? 0}.`,
        });
      }
      break;
    }

    case "anyValue":
      break;
  }

  return issues;
}
