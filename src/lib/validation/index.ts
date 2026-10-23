import Papa from "papaparse";
import { parquetMetadata, parquetReadObjects } from "hyparquet";
import type { TemplateDefinition } from "../templates/schema";
import { detectDelimiter } from "./detect-delimiter";
import { validateCell, type ColumnValidationTarget } from "./rules";
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
const DEFAULT_MAX_PARQUET_SCAN_BYTES = 20 * 1024 * 1024;

export interface ValidationTemplateTarget {
  id?: string;
  name?: string;
  slug?: string;
  kind?: "csv" | "csv-or-parquet";
  delimiter: string;
  volume?: {
    catalog: string;
    schema: string;
    name: string;
  };
  columns: Array<ColumnValidationTarget>;
}

export async function validateFile(
  input: ValidationInput,
  template: ValidationTemplateTarget | TemplateDefinition,
  options?: ValidationOptions
): Promise<ValidationResult> {
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

  if (ext !== ".csv" && ext !== ".parquet") {
    addIssue({
      level: "error",
      code: "INVALID_EXTENSION",
      message: "Ekstensi file harus berupa .csv atau .parquet.",
    });
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

  if (ext === ".parquet") {
    return validateParquet(input, template, options, addIssue, createResult);
  }

  return validateCsv(input, template, addIssue, createResult);
}

function validateCsv(
  input: ValidationInput,
  template: ValidationTemplateTarget | TemplateDefinition,
  addIssue: (issue: ValidationIssue) => void,
  createResult: (rowCount?: number, columnCount?: number, delimiter?: string) => ValidationResult
): ValidationResult {
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
      message: "Berkas memiliki tanda Byte Order Mark (BOM). Berkas akan diteruskan tanpa perubahan.",
    });
    text = text.replace(/^\uFEFF/, "");
  }

  const firstLine = text.split(/\r?\n/)[0] || "";
  const detectedDelimiter = detectDelimiter(firstLine);

  if (detectedDelimiter !== template.delimiter) {
    const actual = detectedDelimiter || (template.delimiter === ";" ? "," : ";");
    addIssue({
      level: "error",
      code: "DELIMITER_MISMATCH",
      message: `Pemisah file adalah '${actual}' padahal template memakai '${template.delimiter}'`,
    });
    return createResult(0, 0, actual);
  }

  const parseResult = Papa.parse<string[]>(text, {
    delimiter: template.delimiter,
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
    return createResult(0, 0, template.delimiter);
  }

  const rawHeader = rows[0];
  const columnCount = rawHeader.length;
  const trimmedHeader = rawHeader.map((h) => h.trim());

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
    (colName) => !trimmedHeader.includes(colName)
  );
  const extraCols = trimmedHeader.filter(
    (colName) => !templateColNames.includes(colName)
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

      if (colDef.rule.type === "decimal") {
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
      message: "Berkas tidak memiliki baris data (hanya header atau baris kosong).",
    });
  }

  return createResult(validDataRows, columnCount, template.delimiter);
}

function mapParquetType(elem: {
  type?: unknown;
  converted_type?: unknown;
}): "integer" | "decimal" | "date" | "text" {
  const typeStr = String(elem.type || "");
  const convertedTypeStr = String(elem.converted_type || "");

  if (
    convertedTypeStr.includes("INT") ||
    typeStr === "INT32" ||
    typeStr === "INT64"
  ) {
    return "integer";
  }

  if (
    typeStr === "FLOAT" ||
    typeStr === "DOUBLE" ||
    convertedTypeStr.includes("DECIMAL")
  ) {
    return "decimal";
  }

  if (
    convertedTypeStr === "DATE" ||
    convertedTypeStr.includes("TIMESTAMP") ||
    convertedTypeStr.includes("TIME")
  ) {
    return "date";
  }

  return "text";
}

function isTypeCompatible(
  parquetType: "integer" | "decimal" | "date" | "text",
  ruleType: string
): boolean {
  if (parquetType === ruleType) return true;
  if (ruleType === "digits" && (parquetType === "text" || parquetType === "integer")) {
    return true;
  }
  if (ruleType === "list" && parquetType === "text") {
    return true;
  }
  if (parquetType === "text") {
    return true;
  }
  return false;
}

async function validateParquet(
  input: ValidationInput,
  template: ValidationTemplateTarget | TemplateDefinition,
  options: ValidationOptions | undefined,
  addIssue: (issue: ValidationIssue) => void,
  createResult: (rowCount?: number, columnCount?: number, delimiter?: string) => ValidationResult
): Promise<ValidationResult> {
  const bytes = input.bytes;
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
      message: "Berkas Parquet tidak valid (signature PAR1 tidak ditemukan).",
    });
    return createResult();
  }

  let metadata;
  try {
    const arrayBuf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    metadata = parquetMetadata(arrayBuf);
  } catch (err) {
    addIssue({
      level: "error",
      code: "INVALID_PARQUET_METADATA",
      message: `Gagal membaca metadata Parquet: ${err instanceof Error ? err.message : String(err)}`,
    });
    return createResult();
  }

  const schemaElements = metadata.schema.slice(1);
  let hasSchemaErrors = false;
  const recordParquetIssue = (issue: ValidationIssue) => {
    if (issue.level === "error") {
      hasSchemaErrors = true;
    }
    addIssue(issue);
  };
  const parquetColNames = schemaElements.map((e) => e.name);
  const templateColNames = template.columns.map((c) => c.name);

  const missingCols = templateColNames.filter(
    (name) => !parquetColNames.includes(name)
  );
  const extraCols = parquetColNames.filter(
    (name) => !templateColNames.includes(name)
  );

  for (const col of missingCols) {
    recordParquetIssue({
      level: "error",
      code: "MISSING_COLUMN",
      column: col,
      message: `Kolom wajib '${col}' tidak ditemukan dalam schema Parquet.`,
    });
  }

  for (const col of extraCols) {
    recordParquetIssue({
      level: "error",
      code: "UNKNOWN_COLUMN",
      column: col,
      message: `Kolom '${col}' tidak dikenali dalam template.`,
    });
  }

  for (const elem of schemaElements) {
    const colDef = template.columns.find((c) => c.name === elem.name);
    if (!colDef) continue;

    const parquetType = mapParquetType(elem);
    if (!isTypeCompatible(parquetType, colDef.rule.type)) {
      recordParquetIssue({
        level: "error",
        code: "INCOMPATIBLE_COLUMN_TYPE",
        column: colDef.name,
        message: `Tipe kolom '${colDef.name}' pada Parquet (${parquetType}) tidak kompatibel dengan aturan template (${colDef.rule.type}).`,
      });
    }

    if (colDef.required && elem.repetition_type === "OPTIONAL") {
      let isAllNull = false;
      const rowGroups = metadata.row_groups || [];
      if (rowGroups.length > 0) {
        let totalNulls = BigInt(0);
        let totalValues = BigInt(0);
        let hasStats = true;

        for (const rg of rowGroups) {
          const colMeta = rg.columns.find(
            (c) => c.meta_data?.path_in_schema?.[0] === elem.name
          );
          if (colMeta?.meta_data?.statistics?.null_count !== undefined) {
            totalNulls += BigInt(colMeta.meta_data.statistics.null_count);
            totalValues += BigInt(colMeta.meta_data.num_values || 0);
          } else {
            hasStats = false;
            break;
          }
        }

        if (hasStats && totalValues > BigInt(0) && totalNulls >= totalValues) {
          isAllNull = true;
        }
      }

      if (isAllNull) {
        recordParquetIssue({
          level: "error",
          code: "REQUIRED_FIELD_ALL_NULL",
          column: colDef.name,
          message: `Kolom wajib '${colDef.name}' dinyatakan opsional dan seluruh nilainya adalah null dalam statistik berkas.`,
        });
      }
    }
  }

  const rowCount = Number(metadata.num_rows || 0);
  if (rowCount === 0) {
    recordParquetIssue({
      level: "error",
      code: "NO_DATA_ROWS",
      message: "Berkas tidak memiliki baris data.",
    });
  }

  const maxScanBytes =
    options?.maxParquetRowScanBytes ?? DEFAULT_MAX_PARQUET_SCAN_BYTES;
  const isLargeFile = input.bytes.byteLength > maxScanBytes;

  if (isLargeFile) {
    addIssue({
      level: "warning",
      code: "LARGE_PARQUET_SKIPPED",
      message: "Isi sel tidak diperiksa untuk file besar.",
    });
    return createResult(rowCount, parquetColNames.length);
  }

  if (rowCount > 0 && hasSchemaErrors === false) {
    try {
      const arrayBuf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const records = (await parquetReadObjects({
        file: arrayBuf,
      })) as Record<string, unknown>[];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const line = i + 1;

        for (const colDef of template.columns) {
          const val = record[colDef.name];
          const cellIssues = validateCell(val, colDef, line);
          for (const ci of cellIssues) {
            addIssue(ci);
          }
        }
      }
    } catch (err) {
      addIssue({
        level: "warning",
        code: "PARQUET_ROW_READ_FAILED",
        message: `Gagal membaca isi sel Parquet: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return createResult(rowCount, parquetColNames.length);
}
