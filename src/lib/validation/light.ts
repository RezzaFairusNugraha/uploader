import { getLimits } from "@/platform/limits";
import type { TemplateDefinition } from "../templates/schema";
import { detectDelimiter } from "./detect-delimiter";
import { validateCell } from "./rules";
import type { ValidationTemplateTarget } from "./index";

export interface LightValidationResult {
  ok: boolean;
  error?: string;
  rowCount?: number;
  columnCount?: number;
}

export function validateLight(
  chunk: Uint8Array,
  fileName: string,
  template: ValidationTemplateTarget | TemplateDefinition,
  contentLength?: number,
  settingMaxUploadMb?: number
): LightValidationResult {
  if ("status" in template && template.status && template.status !== "aktif") {
    return { ok: false, error: "Template belum aktif atau telah diarsipkan" };
  }

  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : "";
  if (ext !== ".csv" && ext !== ".parquet") {
    return { ok: false, error: "Ekstensi file harus berupa .csv atau .parquet." };
  }

  const limits = getLimits(settingMaxUploadMb);
  const maxBytes = limits.maxUploadMb * 1024 * 1024;

  if (typeof contentLength === "number" && contentLength > maxBytes) {
    return {
      ok: false,
      error: `Ukuran berkas melebihi batas maksimum (${limits.maxUploadMb} MB)`,
    };
  }

  if (chunk.length > maxBytes) {
    return {
      ok: false,
      error: `Ukuran berkas melebihi batas maksimum (${limits.maxUploadMb} MB)`,
    };
  }

  if (ext === ".parquet") {
    if (
      chunk.length < 4 ||
      chunk[0] !== 0x50 ||
      chunk[1] !== 0x41 ||
      chunk[2] !== 0x52 ||
      chunk[3] !== 0x31
    ) {
      return {
        ok: false,
        error: "Bukan berkas Parquet yang valid (tanda PAR1 tidak ditemukan)",
      };
    }
    return {
      ok: true,
      rowCount: 0,
      columnCount: template.columns.length,
    };
  }

  let text = new TextDecoder("utf-8").decode(chunk);
  text = text.replace(/^\uFEFF/, "");

  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
    return { ok: false, error: "Berkas kosong" };
  }

  const headerLine = lines[0];
  const detected = detectDelimiter(headerLine);
  if (detected && detected !== template.delimiter) {
    return {
      ok: false,
      error: `Pemisah file adalah '${detected}' padahal template memakai '${template.delimiter}'`,
    };
  }

  const headers = headerLine
    .split(template.delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, ""));

  const templateColNames = template.columns.map((c) => c.name);
  const missingCols = templateColNames.filter((c) => !headers.includes(c));
  if (missingCols.length > 0) {
    return {
      ok: false,
      error: `Kolom wajib '${missingCols[0]}' tidak ditemukan di berkas.`,
    };
  }

  const extraCols = headers.filter((h) => !templateColNames.includes(h));
  if (extraCols.length > 0) {
    return {
      ok: false,
      error: `Kolom '${extraCols[0]}' tidak dikenali dalam template.`,
    };
  }

  if (headers.length !== template.columns.length) {
    return {
      ok: false,
      error: `Jumlah kolom header (${headers.length}) tidak sesuai dengan template (${template.columns.length}).`,
    };
  }

  const colMap = headers.map((h) => template.columns.find((c) => c.name === h));

  const hasMoreThanChunk = chunk.length >= 256 * 1024;
  const candidateLines =
    hasMoreThanChunk && lines.length > 2 ? lines.slice(1, -1) : lines.slice(1);
  const checkLines = candidateLines.slice(0, 200);

  let validRowCount = 0;
  for (let i = 0; i < checkLines.length; i++) {
    const row = checkLines[i];
    if (!row.trim()) continue;
    validRowCount++;

    const cells = row
      .split(template.delimiter)
      .map((c) => c.trim().replace(/^["']|["']$/g, ""));

    for (let j = 0; j < colMap.length; j++) {
      const colDef = colMap[j];
      if (!colDef) continue;
      const issues = validateCell(cells[j], colDef, i + 2);
      const err = issues.find((iss) => iss.level === "error");
      if (err) {
        return { ok: false, error: err.message };
      }
    }
  }

  return {
    ok: true,
    rowCount: validRowCount,
    columnCount: headers.length,
  };
}
