import type { ColumnRule } from "../templates/schema";
import type { ValidationIssue } from "./types";

export interface ColumnValidationTarget {
  name: string;
  required: boolean;
  rule: ColumnRule;
}

function truncateValue(value: string): string {
  return value.length > 40 ? `${value.slice(0, 37)}...` : value;
}

export function validateCell(
  rawValue: unknown,
  column: ColumnValidationTarget,
  line: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const strVal = rawValue === null || rawValue === undefined ? "" : String(rawValue);
  const trimmed = strVal.trim();
  const truncated = truncateValue(strVal);

  if (column.required && (rawValue === null || rawValue === undefined || trimmed.length === 0)) {
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

  if (rawValue === null || rawValue === undefined || trimmed.length === 0) {
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
          message: `Kolom '${column.name}' harus terdiri dari tepat ${rule.length} digit angka.`,
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
        break;
      }

      const num = parseInt(trimmed, 10);
      if (rule.min !== undefined && num < rule.min) {
        issues.push({
          level: "error",
          code: "INVALID_INTEGER_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' bernilai ${num}, kurang dari batas minimum (${rule.min}).`,
        });
      }
      if (rule.max !== undefined && num > rule.max) {
        issues.push({
          level: "error",
          code: "INVALID_INTEGER_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' bernilai ${num}, melebihi batas maksimum (${rule.max}).`,
        });
      }
      break;
    }

    case "decimal": {
      if (rule.allowedText && rule.allowedText.includes(trimmed)) {
        break;
      }

      const hasComma = trimmed.includes(",");
      const hasDot = trimmed.includes(".");

      if (hasComma && hasDot) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Format desimal pada kolom '${column.name}' tidak valid (mengandung titik dan koma sekaligus).`,
        });
        break;
      }

      const allowComma = rule.allowComma ?? true;
      const allowDot = rule.allowDot ?? true;
      const allowScientific = rule.allowScientific ?? true;

      if (hasComma && !allowComma) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak mengizinkan pemisah koma (,).`,
        });
        break;
      }

      if (hasDot && !allowDot) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak mengizinkan pemisah titik (.).`,
        });
        break;
      }

      const isScientific = /[eE][+-]?\d+/.test(trimmed);
      if (isScientific && !allowScientific) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' tidak mengizinkan notasi ilmiah.`,
        });
        break;
      }

      const normalized = trimmed.replace(",", ".");
      const isDecimalValid = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized);
      if (!isDecimalValid) {
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
      if (isNaN(num)) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL",
          line,
          column: column.name,
          value: truncated,
          message: `Nilai pada kolom '${column.name}' bukan angka valid.`,
        });
        break;
      }

      if (rule.min !== undefined && num < rule.min) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' bernilai ${num}, kurang dari batas minimum (${rule.min}).`,
        });
      }
      if (rule.max !== undefined && num > rule.max) {
        issues.push({
          level: "error",
          code: "INVALID_DECIMAL_RANGE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' bernilai ${num}, melebihi batas maksimum (${rule.max}).`,
        });
      }
      break;
    }

    case "date": {
      const isDateValid = checkDateFormat(trimmed, rule.format);
      if (!isDateValid) {
        issues.push({
          level: "error",
          code: "INVALID_DATE",
          line,
          column: column.name,
          value: truncated,
          message: `Kolom '${column.name}' harus berformat tanggal '${rule.format}'.`,
        });
      }
      break;
    }

    case "list": {
      if (!rule.values.includes(trimmed)) {
        issues.push({
          level: "error",
          code: "INVALID_LIST_VALUE",
          line,
          column: column.name,
          value: truncated,
          message: `Nilai '${truncated}' pada kolom '${column.name}' tidak terdapat dalam daftar yang diizinkan (${rule.values.join(", ")}).`,
        });
      }
      break;
    }

    case "text": {
      if (rule.minLength !== undefined && trimmed.length < rule.minLength) {
        issues.push({
          level: "error",
          code: "INVALID_TEXT_LENGTH",
          line,
          column: column.name,
          value: truncated,
          message: `Panjang teks kolom '${column.name}' (${trimmed.length}) kurang dari batas minimum (${rule.minLength}).`,
        });
      }
      if (rule.maxLength !== undefined && trimmed.length > rule.maxLength) {
        issues.push({
          level: "error",
          code: "INVALID_TEXT_LENGTH",
          line,
          column: column.name,
          value: truncated,
          message: `Panjang teks kolom '${column.name}' (${trimmed.length}) melebihi batas maksimum (${rule.maxLength}).`,
        });
      }
      if (rule.allowedValues && rule.allowedValues.length > 0) {
        if (!rule.allowedValues.includes(trimmed)) {
          issues.push({
            level: "error",
            code: "INVALID_ALLOWED_VALUE",
            line,
            column: column.name,
            value: truncated,
            message: `Nilai '${truncated}' pada kolom '${column.name}' tidak termasuk dalam nilai teks yang diizinkan.`,
          });
        }
      }
      break;
    }
  }

  return issues;
}

function checkDateFormat(value: string, format: string): boolean {
  let regex: RegExp;
  let yearIdx = 0;
  let monthIdx = 1;
  let dayIdx = 2;

  switch (format) {
    case "yyyy-MM-dd":
      regex = /^(\d{4})-(\d{2})-(\d{2})$/;
      yearIdx = 1;
      monthIdx = 2;
      dayIdx = 3;
      break;
    case "dd/MM/yyyy":
      regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      dayIdx = 1;
      monthIdx = 2;
      yearIdx = 3;
      break;
    case "MM/dd/yyyy":
      regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      monthIdx = 1;
      dayIdx = 2;
      yearIdx = 3;
      break;
    case "dd-MM-yyyy":
      regex = /^(\d{2})-(\d{2})-(\d{4})$/;
      dayIdx = 1;
      monthIdx = 2;
      yearIdx = 3;
      break;
    case "yyyy/MM/dd":
      regex = /^(\d{4})\/(\d{2})\/(\d{2})$/;
      yearIdx = 1;
      monthIdx = 2;
      dayIdx = 3;
      break;
    default:
      return false;
  }

  const match = value.match(regex);
  if (!match) return false;

  const y = parseInt(match[yearIdx], 10);
  const m = parseInt(match[monthIdx], 10);
  const d = parseInt(match[dayIdx], 10);

  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}
