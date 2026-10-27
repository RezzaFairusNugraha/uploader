import Papa from "papaparse";
import { parquetMetadata, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import type { DatabricksClient, DirectoryEntry } from "@/lib/databricks";
import { getLimits } from "@/platform/limits";
import {
  type ColumnDefinition,
  type ColumnRule,
  type TemplateDelimiter,
  slugify,
} from "@/lib/templates/schema";
import { normalizeColumnName } from "@/lib/templates/infer";

export interface UnsupportedFormat {
  ext: string;
  count: number;
}

export interface ConflictingGroup {
  files: string[];
  columns: string[];
  count: number;
}

export interface InspectVolumeResult {
  volumeName: string;
  catalog: string;
  schema: string;
  csvFolder: string;
  parquetFolder: string;
  csvFolderStatus: "ada" | "akan dibuat";
  parquetFolderStatus: "ada" | "akan dibuat";
  csvFilesCount: number;
  parquetFilesCount: number;
  unsupportedFormats: UnsupportedFormat[];
  sampledFilesCount: number;
  totalFilesCount: number;
  warnings: string[];
  otherGroups: ConflictingGroup[];
  hasDataFiles: boolean;
  draft: {
    name: string;
    slug: string;
    delimiter: TemplateDelimiter;
    csvFolder: string;
    parquetFolder: string;
    columns: ColumnDefinition[];
    volumeCreatedByApp: boolean;
  };
}

interface ScannedFileInfo {
  path: string;
  name: string;
  folder: string;
  ext: string;
  format: "csv" | "parquet" | "other";
  fileSize: number;
  modificationTime: number;
}

interface SampledFileResult {
  file: ScannedFileInfo;
  columns: string[];
  rows: Record<string, unknown>[];
  detectedDelimiter?: ";" | "," | "\t";
}

function detectCsvDelimiter(text: string): ";" | "," | "\t" {
  const lines = text.split(/\r?\n/).slice(0, 5).filter(Boolean);
  let countComma = 0;
  let countSemicolon = 0;
  let countTab = 0;

  for (const line of lines) {
    countComma += (line.match(/,/g) || []).length;
    countSemicolon += (line.match(/;/g) || []).length;
    countTab += (line.match(/\t/g) || []).length;
  }

  if (countSemicolon > countComma && countSemicolon >= countTab) {
    return ";";
  }
  if (countTab > countComma && countTab > countSemicolon) {
    return "\t";
  }
  return ",";
}

function inferLenientRule(
  values: unknown[],
  totalRowsSampled: number
): {
  required: boolean;
  rule: ColumnRule;
} {
  let hasBlank = false;
  const nonBlank: string[] = [];

  for (const v of values) {
    if (v === null || v === undefined) {
      hasBlank = true;
      continue;
    }
    const str = String(v).trim();
    if (str.length === 0) {
      hasBlank = true;
    } else {
      nonBlank.push(str);
    }
  }

  const required = !hasBlank && totalRowsSampled >= 50;

  if (nonBlank.length === 0) {
    return {
      required: false,
      rule: { type: "text" },
    };
  }

  const allDigits = nonBlank.every((v) => /^\d+$/.test(v));
  if (allDigits) {
    const firstLen = nonBlank[0].length;
    const sameLength = nonBlank.every((v) => v.length === firstLen);
    if (sameLength && firstLen >= 4 && nonBlank.length >= 20) {
      return {
        required,
        rule: { type: "digits", length: firstLen },
      };
    }
    return {
      required,
      rule: { type: "integer" },
    };
  }

  const allInteger = nonBlank.every((v) => /^-?\d+$/.test(v));
  if (allInteger) {
    return {
      required,
      rule: { type: "integer" },
    };
  }

  const isNumeric = (v: string): boolean => {
    return /^-?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(v);
  };

  let numericCount = 0;
  let hasComma = false;
  let hasDot = false;
  let hasScientific = false;
  const nonNumericFreq: Record<string, number> = {};

  for (const v of nonBlank) {
    if (isNumeric(v)) {
      numericCount++;
      if (v.includes(",")) hasComma = true;
      if (v.includes(".")) hasDot = true;
      if (/[eE]/.test(v)) hasScientific = true;
    } else {
      nonNumericFreq[v] = (nonNumericFreq[v] || 0) + 1;
    }
  }

  const total = nonBlank.length;
  if (numericCount > 0 && numericCount / total >= 0.5) {
    const allowedText: string[] = [];
    for (const [txt, count] of Object.entries(nonNumericFreq)) {
      if (count / total >= 0.05) {
        allowedText.push(txt);
      }
    }

    const accounted =
      numericCount +
      allowedText.reduce((acc, t) => acc + (nonNumericFreq[t] || 0), 0);

    if (accounted === total) {
      return {
        required,
        rule: {
          type: "decimal",
          allowComma: hasComma || (!hasDot && !hasComma),
          allowDot: hasDot,
          allowScientific: hasScientific,
          allowedText: allowedText.length > 0 ? allowedText : undefined,
        },
      };
    }
  }

  const dateFormats = [
    { format: "yyyy-MM-dd" as const, regex: /^\d{4}-\d{2}-\d{2}$/ },
    { format: "dd/MM/yyyy" as const, regex: /^\d{2}\/\d{2}\/\d{4}$/ },
    { format: "MM/dd/yyyy" as const, regex: /^\d{2}\/\d{2}\/\d{4}$/ },
    { format: "dd-MM-yyyy" as const, regex: /^\d{2}-\d{2}-\d{4}$/ },
    { format: "yyyy/MM/dd" as const, regex: /^\d{4}\/\d{2}\/\d{2}$/ },
  ];

  for (const df of dateFormats) {
    if (df.format === "MM/dd/yyyy") continue;
    if (nonBlank.every((v) => df.regex.test(v))) {
      return {
        required,
        rule: { type: "date", format: df.format },
      };
    }
  }

  return {
    required,
    rule: { type: "text" },
  };
}

function suggestTemplateName(raw: string): string {
  const cleaned = raw.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Template Baru";
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function inspectVolume(
  client: DatabricksClient,
  catalog: string,
  schema: string,
  volumeName: string
): Promise<InspectVolumeResult> {
  const rootPath = `/Volumes/${catalog}/${schema}/${volumeName}`;
  const files: ScannedFileInfo[] = [];
  const unsupportedMap = new Map<string, number>();

  const rootRes = await client.listDirectory(rootPath);
  const depth1Entries: DirectoryEntry[] = rootRes.success && rootRes.data ? rootRes.data.contents : [];

  for (const entry of depth1Entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) {
      continue;
    }

    if (entry.is_directory) {
      const subRes = await client.listDirectory(entry.path);
      const depth2Entries = subRes.success && subRes.data ? subRes.data.contents : [];
      for (const sub of depth2Entries) {
        if (sub.is_directory || sub.name.startsWith("_") || sub.name.startsWith(".")) {
          continue;
        }
        const ext = (sub.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
        let format: ScannedFileInfo["format"] = "other";
        if (ext === ".csv" || ext === ".tsv") {
          format = "csv";
        } else if (ext === ".parquet") {
          format = "parquet";
        } else {
          unsupportedMap.set(ext || "tanpa ekstensi", (unsupportedMap.get(ext || "tanpa ekstensi") || 0) + 1);
        }

        files.push({
          path: sub.path,
          name: sub.name,
          folder: entry.name,
          ext,
          format,
          fileSize: sub.file_size || 0,
          modificationTime: sub.modification_time || 0,
        });
      }
    } else {
      const ext = (entry.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
      let format: ScannedFileInfo["format"] = "other";
      if (ext === ".csv" || ext === ".tsv") {
        format = "csv";
      } else if (ext === ".parquet") {
        format = "parquet";
      } else {
        unsupportedMap.set(ext || "tanpa ekstensi", (unsupportedMap.get(ext || "tanpa ekstensi") || 0) + 1);
      }

      files.push({
        path: entry.path,
        name: entry.name,
        folder: "",
        ext,
        format,
        fileSize: entry.file_size || 0,
        modificationTime: entry.modification_time || 0,
      });
    }
  }

  const unsupportedFormats: UnsupportedFormat[] = Array.from(unsupportedMap.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count);

  const csvFiles = files.filter((f) => f.format === "csv");
  const parquetFiles = files.filter((f) => f.format === "parquet");
  const totalDataFiles = csvFiles.length + parquetFiles.length;

  const pickFolder = (
    items: ScannedFileInfo[],
    defaultName: string
  ): { folder: string; status: "ada" | "akan dibuat" } => {
    if (items.length === 0) {
      return { folder: defaultName, status: "akan dibuat" };
    }
    const counts = new Map<string, { count: number; newest: number }>();
    for (const item of items) {
      const current = counts.get(item.folder) || { count: 0, newest: 0 };
      counts.set(item.folder, {
        count: current.count + 1,
        newest: Math.max(current.newest, item.modificationTime),
      });
    }
    let bestFolder = defaultName;
    let maxCount = -1;
    let newestTime = -1;

    for (const [folder, data] of counts.entries()) {
      if (
        data.count > maxCount ||
        (data.count === maxCount && data.newest > newestTime)
      ) {
        maxCount = data.count;
        newestTime = data.newest;
        bestFolder = folder;
      }
    }

    return { folder: bestFolder, status: "ada" };
  };

  const csvChoice = pickFolder(csvFiles, "csv");
  const parquetChoice = pickFolder(parquetFiles, "parquet");

  if (totalDataFiles === 0) {
    const suggestedName = suggestTemplateName(volumeName);
    return {
      volumeName,
      catalog,
      schema,
      csvFolder: csvChoice.folder,
      parquetFolder: parquetChoice.folder,
      csvFolderStatus: csvChoice.status,
      parquetFolderStatus: parquetChoice.status,
      csvFilesCount: 0,
      parquetFilesCount: 0,
      unsupportedFormats,
      sampledFilesCount: 0,
      totalFilesCount: files.length,
      warnings: ["Belum ada file data (CSV atau Parquet) di dalam folder ini."],
      otherGroups: [],
      hasDataFiles: false,
      draft: {
        name: suggestedName,
        slug: slugify(suggestedName),
        delimiter: ",",
        csvFolder: csvChoice.folder,
        parquetFolder: parquetChoice.folder,
        columns: [],
        volumeCreatedByApp: false,
      },
    };
  }

  const limits = getLimits();
  const maxFiles = limits.serverValidation === "light" ? 3 : 5;
  const maxRows = limits.maxInspectRows;

  const newestCsv = [...csvFiles]
    .sort((a, b) => b.modificationTime - a.modificationTime)
    .slice(0, maxFiles);
  const newestParquet = [...parquetFiles]
    .sort((a, b) => b.modificationTime - a.modificationTime)
    .slice(0, maxFiles);

  const sampledResults: SampledFileResult[] = [];

  for (const f of newestCsv) {
    try {
      const rangeRes = await client.readRange(f.path, 0, 1024 * 1024);
      if (!rangeRes.success || !rangeRes.data) continue;

      let text = new TextDecoder("utf-8").decode(rangeRes.data);
      if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r")) {
        const lastNl = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));
        if (lastNl !== -1) {
          text = text.slice(0, lastNl + 1);
        }
      }

      const delimiter = detectCsvDelimiter(text);
      const parsed = Papa.parse<Record<string, unknown>>(text, {
        preview: maxRows,
        header: true,
        delimiter,
        skipEmptyLines: true,
      });

      const cols = (parsed.meta.fields || []).map((c) => c.trim()).filter(Boolean);
      if (cols.length > 0) {
        sampledResults.push({
          file: f,
          columns: cols,
          rows: parsed.data || [],
          detectedDelimiter: delimiter,
        });
      }
    } catch {
      continue;
    }
  }

  for (const f of newestParquet) {
    try {
      const fileSize = f.fileSize;
      let rawCols: string[] = [];
      let records: Record<string, unknown>[] = [];

      const toArrayBuffer = (u8: Uint8Array): ArrayBuffer => {
        const ab = new ArrayBuffer(u8.byteLength);
        new Uint8Array(ab).set(u8);
        return ab;
      };

      if (fileSize > 0 && fileSize <= 1024 * 1024) {
        const readRes = await client.readRange(f.path, 0, fileSize);
        if (readRes.success && readRes.data) {
          const buf = toArrayBuffer(readRes.data);
          const meta = parquetMetadata(buf);
          rawCols = meta.schema.slice(1).map((s) => s.name);
          records = (await parquetReadObjects({
            file: buf,
            rowStart: 0,
            rowEnd: maxRows,
          })) as Record<string, unknown>[];
        }
      } else {
        const asyncBuffer = {
          byteLength: fileSize || 1024 * 1024,
          async slice(start: number, end?: number): Promise<ArrayBuffer> {
            const endPos = end !== undefined ? end : (fileSize || 1024 * 1024);
            const len = Math.max(0, endPos - start);
            const rangeRes = await client.readRange(f.path, start, len);
            if (!rangeRes.success || !rangeRes.data) {
              throw new Error("Gagal membaca berkas Parquet");
            }
            return toArrayBuffer(rangeRes.data);
          },
        };

        const meta = await parquetMetadataAsync(asyncBuffer);
        rawCols = meta.schema.slice(1).map((s) => s.name);
        records = (await parquetReadObjects({
          file: asyncBuffer,
          rowStart: 0,
          rowEnd: maxRows,
        })) as Record<string, unknown>[];
      }

      if (rawCols.length > 0) {
        sampledResults.push({
          file: f,
          columns: rawCols,
          rows: records,
        });
      }
    } catch {
      continue;
    }
  }

  const warnings: string[] = [];
  const sampledCount = sampledResults.length;
  if (totalDataFiles > sampledCount) {
    warnings.push(`Hanya ${sampledCount} file yang dibaca`);
  }

  const csvSampled = sampledResults.filter((s) => s.file.format === "csv");
  const parquetSampled = sampledResults.filter((s) => s.file.format === "parquet");

  if (csvSampled.length > 0 && parquetSampled.length > 0) {
    const csvColsKey = [...csvSampled[0].columns].map((c) => c.toLowerCase()).sort().join("|");
    const parquetColsKey = [...parquetSampled[0].columns].map((c) => c.toLowerCase()).sort().join("|");
    if (csvColsKey !== parquetColsKey) {
      warnings.push("File CSV dan Parquet punya kolom yang berbeda");
    }
  }

  const groups = new Map<
    string,
    {
      key: string;
      columns: string[];
      files: SampledFileResult[];
      newestTime: number;
    }
  >();

  for (const item of sampledResults) {
    const key = [...item.columns].map((c) => c.toLowerCase()).sort().join("|");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        columns: item.columns,
        files: [item],
        newestTime: item.file.modificationTime,
      });
    } else {
      existing.files.push(item);
      existing.newestTime = Math.max(existing.newestTime, item.file.modificationTime);
    }
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (b.files.length !== a.files.length) {
      return b.files.length - a.files.length;
    }
    return b.newestTime - a.newestTime;
  });

  const chosenGroup = sortedGroups[0];
  const otherGroups: ConflictingGroup[] = [];

  if (sortedGroups.length > 1) {
    for (let i = 1; i < sortedGroups.length; i++) {
      const g = sortedGroups[i];
      warnings.push(
        `${g.files.length} file lain punya kolom berbeda (${g.columns.join(", ")}). Sebaiknya dipisah ke folder lain.`
      );
      otherGroups.push({
        files: g.files.map((item) => item.file.name),
        columns: g.columns,
        count: g.files.length,
      });
    }
  }

  let finalDelimiter: TemplateDelimiter = ",";
  const chosenCsv = chosenGroup?.files.filter((f) => f.file.format === "csv") || [];
  if (chosenCsv.length > 0) {
    const newestChosenCsv = [...chosenCsv].sort((a, b) => b.file.modificationTime - a.file.modificationTime)[0];
    if (newestChosenCsv.detectedDelimiter === ";") {
      finalDelimiter = ";";
    }
  }

  const columns: ColumnDefinition[] = [];
  const seenColNames = new Set<string>();
  const totalSampledRows = chosenGroup ? chosenGroup.files.reduce((acc, f) => acc + f.rows.length, 0) : 0;

  if (chosenGroup) {
    for (const originalCol of chosenGroup.columns) {
      let { name } = normalizeColumnName(originalCol);
      if (seenColNames.has(name)) {
        let counter = 2;
        while (seenColNames.has(`${name}_${counter}`)) {
          counter++;
        }
        name = `${name}_${counter}`;
      }
      seenColNames.add(name);

      const pooledValues: unknown[] = [];
      for (const item of chosenGroup.files) {
        for (const row of item.rows) {
          pooledValues.push(row[originalCol]);
        }
      }

      const inferred = inferLenientRule(pooledValues, totalSampledRows);
      columns.push({
        name,
        required: inferred.required,
        rule: inferred.rule,
      });
    }
  }

  const templateName = suggestTemplateName(volumeName);

  return {
    volumeName,
    catalog,
    schema,
    csvFolder: csvChoice.folder,
    parquetFolder: parquetChoice.folder,
    csvFolderStatus: csvChoice.status,
    parquetFolderStatus: parquetChoice.status,
    csvFilesCount: csvFiles.length,
    parquetFilesCount: parquetFiles.length,
    unsupportedFormats,
    sampledFilesCount: sampledCount,
    totalFilesCount: files.length,
    warnings,
    otherGroups,
    hasDataFiles: true,
    draft: {
      name: templateName,
      slug: slugify(templateName),
      delimiter: finalDelimiter,
      csvFolder: csvChoice.folder,
      parquetFolder: parquetChoice.folder,
      columns,
      volumeCreatedByApp: false,
    },
  };
}
