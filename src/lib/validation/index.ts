import Papa from "papaparse";
import type { TemplateConfig } from "../templates";
import { detectDelimiter } from "./detect-delimiter";
import { validateCell } from "./rules";
import type {
  ValidationInput,
  ValidationIssue,
  ValidationOptions,
  ValidationResult,
  ValidationSummary,
} from "./types";

export * from "./types";
export * from "./detect-delimiter";
export * from "./rules";

const MAX_STORED_ISSUES = 200;

export function validateFile(
  input: ValidationInput,
  template: TemplateConfig,
  options?: ValidationOptions
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const issueCounts: Record<string, number> = {};
  let totalErrors = 0;
  let totalWarnings = 0;

  const addIssue = (issue: ValidationIssue) => {
    issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
    if (issue.level === "error") {
      totalErrors++;
      if (errors.length < MAX_STORED_ISSUES) {
        errors.push(issue);
      }
    } else {
      totalWarnings++;
      if (warnings.length < MAX_STORED_ISSUES) {
        warnings.push(issue);
      }
    }
  };

  const createResult = (
    rowCount: number = 0,
    columnCount: number = 0,
    detectedDelimiter: string = ""
  ): ValidationResult => {
    const summary: ValidationSummary = {
      rowCount,
      columnCount,
      detectedDelimiter,
      issueCounts,
      totalErrors,
      totalWarnings,
    };

    return {
      ok: totalErrors === 0,
      errors,
      warnings,
      summary,
    };
  };

  const name = input.name || "";
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot !== -1 ? name.slice(lastDot).toLowerCase() : "";

  if (ext === ".xlsx" || ext === ".xls") {
    addIssue({
      level: "error",
      code: "EXCEL_FILE_UPLOADED",
      message: "Simpan file sebagai CSV (pemisah titik koma) lalu unggah lagi.",
    });
    return createResult();
  }

  const isCsvOrParquet = template.kind === "csv-or-parquet";

  if (isCsvOrParquet) {
    if (ext !== ".csv" && ext !== ".parquet") {
      addIssue({
        level: "error",
        code: "INVALID_EXTENSION",
        message: "Ekstensi file harus berupa .csv atau .parquet.",
      });
      return createResult();
    }
  } else {
    if (ext !== ".csv") {
      addIssue({
        level: "error",
        code: "INVALID_EXTENSION",
        message: "Ekstensi file harus berupa .csv.",
      });
      return createResult();
    }
  }

  if (ext === ".parquet") {
    const { bytes } = input;
    const isParquet =
      bytes.length >= 12 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x41 &&
      bytes[2] === 0x52 &&
      bytes[3] === 0x31 &&
      bytes[bytes.length - 4] === 0x50 &&
      bytes[bytes.length - 3] === 0x41 &&
      bytes[bytes.length - 2] === 0x52 &&
      bytes[bytes.length - 1] === 0x31;

    if (!isParquet) {
      addIssue({
        level: "error",
        code: "INVALID_PARQUET_FILE",
        message:
          "Berkas Parquet tidak valid (signature PAR1 tidak ditemukan).",
      });
    }

    return createResult();
  }

  const maxFileSizeMb = options?.maxFileSizeMb ?? 100;
  const maxBytes = maxFileSizeMb * 1024 * 1024;

  if (input.bytes.length === 0 || input.size === 0) {
    addIssue({
      level: "error",
      code: "EMPTY_FILE",
      message: "Berkas kosong.",
    });
    return createResult();
  }

  if (input.bytes.length > maxBytes || input.size > maxBytes) {
    addIssue({
      level: "error",
      code: "FILE_TOO_LARGE",
      message: `Ukuran file melebihi batas maksimum (${maxFileSizeMb} MB).`,
    });
    return createResult();
  }

  let text = "";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(input.bytes);
  } catch {
    addIssue({
      level: "error",
      code: "INVALID_UTF8",
      message: "Berkas tidak menggunakan pengodean UTF-8 yang valid.",
    });
    return createResult();
  }

  const hasLeadingBom =
    (input.bytes.length >= 3 &&
      input.bytes[0] === 0xef &&
      input.bytes[1] === 0xbb &&
      input.bytes[2] === 0xbf) ||
    text.charCodeAt(0) === 0xfeff;

  if (hasLeadingBom) {
    addIssue({
      level: "warning",
      code: "BOM_PRESENT",
      message:
        "Berkas memiliki tanda Byte Order Mark (BOM). Berkas akan diteruskan tanpa perubahan.",
    });
    text = text.replace(/^\uFEFF/, "");
  }

  const firstLine = text.split(/\r?\n/)[0] || "";
  const detectedDelimiter = detectDelimiter(firstLine);

  if (isCsvOrParquet) {
    if (detectedDelimiter !== ";" && detectedDelimiter !== ",") {
      addIssue({
        level: "error",
        code: "INVALID_DELIMITER",
        message: "Pemisah file harus berupa titik koma (;) atau koma (,).",
      });
      return createResult(0, 0, detectedDelimiter);
    }
  } else {
    if (detectedDelimiter !== template.delimiter) {
      const actual =
        detectedDelimiter || (template.delimiter === ";" ? "," : ";");
      addIssue({
        level: "error",
        code: "DELIMITER_MISMATCH",
        message: `Pemisah file adalah '${actual}' padahal template memakai '${template.delimiter}'`,
      });
      return createResult(0, 0, actual);
    }
  }

  const parseDelimiter = isCsvOrParquet
    ? detectedDelimiter
    : template.delimiter;

  const parseResult = Papa.parse<string[]>(text, {
    delimiter: parseDelimiter,
    skipEmptyLines: false,
  });

  if (parseResult.errors && parseResult.errors.length > 0) {
    for (const err of parseResult.errors) {
      addIssue({
        level: "error",
        code: "PARSE_ERROR",
        line: err.row !== undefined ? err.row + 1 : undefined,
        message: `Kesalahan parsing CSV: ${err.message}`,
      });
    }
  }

  const rows = parseResult.data;

  if (
    rows.length === 0 ||
    (rows.length === 1 && rows[0].every((c) => c.trim() === ""))
  ) {
    addIssue({
      level: "error",
      code: "EMPTY_FILE",
      message: "Berkas kosong.",
    });
    return createResult(0, 0, parseDelimiter);
  }

  const rawHeader = rows[0];
  const columnCount = rawHeader.length;
  const trimmedHeader = rawHeader.map((h) => h.trim());

  if (isCsvOrParquet) {
    if (columnCount === 0 || trimmedHeader.every((h) => h === "")) {
      addIssue({
        level: "error",
        code: "EMPTY_HEADER",
        line: 1,
        message: "Header kolom tidak ditemukan.",
      });
      return createResult(0, 0, parseDelimiter);
    }

    let validDataRows = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 1;

      if (
        i === rows.length - 1 &&
        row.length === 1 &&
        row[0].trim() === ""
      ) {
        continue;
      }

      const isBlank = row.every((c) => c.trim() === "");
      if (isBlank) {
        addIssue({
          level: "warning",
          code: "BLANK_ROW",
          line,
          message: `Baris ${line} kosong.`,
        });
        continue;
      }

      validDataRows++;

      if (row.length !== columnCount) {
        addIssue({
          level: "error",
          code: "ROW_COLUMN_COUNT_MISMATCH",
          line,
          message: `Jumlah kolom pada baris ${line} (${row.length}) tidak sama dengan jumlah kolom header (${columnCount}).`,
        });
      }
    }

    if (validDataRows === 0) {
      addIssue({
        level: "error",
        code: "NO_DATA_ROWS",
        message:
          "Berkas tidak memiliki baris data (hanya header atau baris kosong).",
      });
    }

    return createResult(validDataRows, columnCount, parseDelimiter);
  }

  if (columnCount !== template.columns.length) {
    addIssue({
      level: "error",
      code: "COLUMN_COUNT_MISMATCH",
      line: 1,
      message: `Jumlah kolom header (${columnCount}) tidak sesuai dengan template (${template.columns.length}).`,
    });
  }

  const templateColNames = template.columns.map((c) => c.name);
  const missingCols = templateColNames.filter(
    (name) => !trimmedHeader.includes(name)
  );
  const extraCols = trimmedHeader.filter(
    (name) => !templateColNames.includes(name)
  );

  for (const col of missingCols) {
    addIssue({
      level: "error",
      code: "MISSING_COLUMN",
      line: 1,
      column: col,
      message: `Kolom wajib '${col}' tidak ditemukan di berkas.`,
    });
  }

  for (const col of extraCols) {
    addIssue({
      level: "error",
      code: "UNKNOWN_COLUMN",
      line: 1,
      column: col,
      message: `Kolom '${col}' tidak dikenali dalam template.`,
    });
  }

  if (
    missingCols.length === 0 &&
    extraCols.length === 0 &&
    columnCount === template.columns.length
  ) {
    const isSameOrder = templateColNames.every(
      (name, idx) => trimmedHeader[idx] === name
    );
    if (!isSameOrder) {
      addIssue({
        level: "warning",
        code: "COLUMN_ORDER_MISMATCH",
        line: 1,
        message: "Urutan kolom pada berkas berbeda dengan template.",
      });
    }
  }

  const colDefMap = trimmedHeader.map((name) =>
    template.columns.find((c) => c.name === name)
  );

  const whitespaceStats: Record<string, { count: number; lines: number[] }> = {};
  const decimalStats: Record<
    string,
    { dotCount: number; commaCount: number; firstDotLine?: number; firstCommaLine?: number }
  > = {};

  let validDataRows = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;

    if (
      i === rows.length - 1 &&
      row.length === 1 &&
      row[0].trim() === ""
    ) {
      continue;
    }

    const isBlank = row.every((c) => c.trim() === "");
    if (isBlank) {
      addIssue({
        level: "warning",
        code: "BLANK_ROW",
        line,
        message: `Baris ${line} kosong.`,
      });
      continue;
    }

    validDataRows++;

    if (row.length !== columnCount) {
      addIssue({
        level: "error",
        code: "ROW_COLUMN_COUNT_MISMATCH",
        line,
        message: `Jumlah kolom pada baris ${line} (${row.length}) tidak sama dengan jumlah kolom header (${columnCount}).`,
      });
      continue;
    }

    for (let c = 0; c < row.length; c++) {
      const colDef = colDefMap[c];
      if (!colDef) {
        continue;
      }
      const val = row[c];

      if (val.length > 0) {
        const hasStartOrEndSpace = val.startsWith(" ") || val.endsWith(" ");
        if (hasStartOrEndSpace) {
          if (!whitespaceStats[colDef.name]) {
            whitespaceStats[colDef.name] = { count: 0, lines: [] };
          }
          const stat = whitespaceStats[colDef.name];
          stat.count++;
          if (stat.lines.length < 3) {
            stat.lines.push(line);
          }
        }
      }

      const ruleType = colDef.rule.type;
      if (ruleType === "decimal" || ruleType === "numericOrText") {
        const trimmed = val.trim();
        if (trimmed.length > 0) {
          const hasDot = trimmed.includes(".");
          const hasComma = trimmed.includes(",");
          if ((hasDot && !hasComma) || (hasComma && !hasDot)) {
            if (!decimalStats[colDef.name]) {
              decimalStats[colDef.name] = { dotCount: 0, commaCount: 0 };
            }
            const stat = decimalStats[colDef.name];
            if (hasDot) {
              stat.dotCount++;
              if (stat.firstDotLine === undefined) {
                stat.firstDotLine = line;
              }
            } else {
              stat.commaCount++;
              if (stat.firstCommaLine === undefined) {
                stat.firstCommaLine = line;
              }
            }
          }
        }
      }

      const cellIssues = validateCell(val, colDef, line);
      for (const ci of cellIssues) {
        addIssue(ci);
      }
    }
  }

  for (const [colName, stat] of Object.entries(whitespaceStats)) {
    if (stat.count > 0) {
      const lineStr = stat.lines.join(", ");
      addIssue({
        level: "warning",
        code: "WHITESPACE_TRIM_WARNING",
        column: colName,
        message: `${stat.count} nilai di kolom '${colName}' memiliki spasi di awal atau akhir (baris ${lineStr}).`,
      });
    }
  }

  for (const [colName, stat] of Object.entries(decimalStats)) {
    if (stat.dotCount > 0 && stat.commaCount > 0) {
      addIssue({
        level: "warning",
        code: "MIXED_DECIMAL_SEPARATORS",
        column: colName,
        message: `Kolom '${colName}' mencampur pemisah desimal titik (${stat.dotCount} nilai, contoh baris ${stat.firstDotLine}) dan koma (${stat.commaCount} nilai, contoh baris ${stat.firstCommaLine}).`,
      });
    }
  }

  if (validDataRows === 0) {
    addIssue({
      level: "error",
      code: "NO_DATA_ROWS",
      message:
        "Berkas tidak memiliki baris data (hanya header atau baris kosong).",
    });
  }

  return createResult(validDataRows, columnCount, parseDelimiter);
}
