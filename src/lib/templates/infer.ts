import Papa from "papaparse";
import { parquetMetadata, parquetReadObjects } from "hyparquet";
import {
  columnNameRegex,
  type ColumnRule,
  type TemplateDelimiter,
} from "./schema";

export interface InferredColumn {
  name: string;
  originalName: string;
  renamed: boolean;
  required: boolean;
  type: "text" | "integer" | "digits" | "decimal" | "date" | "list";
  rule: ColumnRule;
  suggestedList?: string[];
  observedMin?: number;
  observedMax?: number;
}

export interface InferredTemplateStructure {
  name: string;
  delimiter: TemplateDelimiter;
  columns: InferredColumn[];
  sampleRowCount: number;
}

export function normalizeColumnName(rawName: string): { name: string; renamed: boolean } {
  const trimmed = rawName.trim();
  let normalized = trimmed
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    normalized = "kolom";
  }

  if (normalized.length > 64) {
    normalized = normalized.slice(0, 64).replace(/_+$/, "");
  }

  if (!columnNameRegex.test(normalized)) {
    normalized = `col_${normalized}`.slice(0, 64);
  }

  return {
    name: normalized,
    renamed: normalized !== trimmed,
  };
}

export function inferRuleFromValues(values: (string | null | undefined)[]): {
  required: boolean;
  type: "text" | "integer" | "digits" | "decimal" | "date" | "list";
  rule: ColumnRule;
  suggestedList?: string[];
  observedMin?: number;
  observedMax?: number;
} {
  let hasBlank = false;
  const nonBlankValues: string[] = [];

  for (const v of values) {
    if (v === null || v === undefined) {
      hasBlank = true;
      continue;
    }
    const str = String(v).trim();
    if (str.length === 0) {
      hasBlank = true;
    } else {
      nonBlankValues.push(str);
    }
  }

  const required = !hasBlank && nonBlankValues.length > 0;

  if (nonBlankValues.length === 0) {
    return {
      required: false,
      type: "text",
      rule: { type: "text" },
    };
  }

  const allDigits = nonBlankValues.every((v) => /^\d+$/.test(v));
  if (allDigits) {
    const firstLen = nonBlankValues[0].length;
    const sameLength = nonBlankValues.every((v) => v.length === firstLen);
    if (sameLength) {
      return {
        required,
        type: "digits",
        rule: { type: "digits", length: firstLen },
      };
    }

    const nums = nonBlankValues.map((v) => parseInt(v, 10));
    const observedMin = Math.min(...nums);
    const observedMax = Math.max(...nums);
    return {
      required,
      type: "integer",
      rule: { type: "integer" },
      observedMin,
      observedMax,
    };
  }

  const allInteger = nonBlankValues.every((v) => /^-?\d+$/.test(v));
  if (allInteger) {
    const nums = nonBlankValues.map((v) => parseInt(v, 10));
    const observedMin = Math.min(...nums);
    const observedMax = Math.max(...nums);
    return {
      required,
      type: "integer",
      rule: { type: "integer" },
      observedMin,
      observedMax,
    };
  }

  const isNumericValue = (v: string): boolean => {
    return /^-?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(v);
  };

  let numericCount = 0;
  let hasComma = false;
  let hasDot = false;
  let hasScientific = false;
  const nonNumericFreq: Record<string, number> = {};

  for (const v of nonBlankValues) {
    if (isNumericValue(v)) {
      numericCount++;
      if (v.includes(",")) hasComma = true;
      if (v.includes(".")) hasDot = true;
      if (/[eE]/.test(v)) hasScientific = true;
    } else {
      nonNumericFreq[v] = (nonNumericFreq[v] || 0) + 1;
    }
  }

  const total = nonBlankValues.length;
  if (numericCount > 0 && numericCount / total >= 0.5) {
    const allowedText: string[] = [];
    for (const [txt, count] of Object.entries(nonNumericFreq)) {
      if (count / total >= 0.05) {
        allowedText.push(txt);
      }
    }

    if (numericCount + allowedText.reduce((acc, t) => acc + (nonNumericFreq[t] || 0), 0) === total) {
      return {
        required,
        type: "decimal",
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
    if (nonBlankValues.every((v) => df.regex.test(v))) {
      return {
        required,
        type: "date",
        rule: { type: "date", format: df.format },
      };
    }
  }

  const distinct = Array.from(new Set(nonBlankValues));
  if (distinct.length <= 20 && total >= 50) {
    return {
      required,
      type: "text",
      rule: { type: "text" },
      suggestedList: distinct,
    };
  }

  return {
    required,
    type: "text",
    rule: { type: "text" },
  };
}

export function inferFromCsv(
  csvText: string,
  fileName: string
): InferredTemplateStructure {
  const firstLine = csvText.split(/\r\n|\n|\r/)[0] || "";
  const countSemicolon = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const delimiter: TemplateDelimiter = countSemicolon >= countComma ? ";" : ",";

  const parsed = Papa.parse<string[]>(csvText, {
    delimiter,
    preview: 5001,
    skipEmptyLines: false,
  });

  const rows = parsed.data.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ""));
  if (rows.length === 0) {
    throw new Error("Berkas CSV kosong atau tidak memiliki data");
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(1, 5001);

  const seenNames = new Set<string>();
  const columns: InferredColumn[] = headerRow.map((colHeader, idx) => {
    let { name, renamed } = normalizeColumnName(colHeader);
    if (seenNames.has(name)) {
      let counter = 2;
      while (seenNames.has(`${name}_${counter}`)) {
        counter++;
      }
      name = `${name}_${counter}`;
      renamed = true;
    }
    seenNames.add(name);

    const colValues = dataRows.map((r) => (r[idx] !== undefined ? r[idx] : ""));
    const inferred = inferRuleFromValues(colValues);

    return {
      name,
      originalName: colHeader,
      renamed,
      required: inferred.required,
      type: inferred.type,
      rule: inferred.rule,
      suggestedList: inferred.suggestedList,
      observedMin: inferred.observedMin,
      observedMax: inferred.observedMax,
    };
  });

  const baseName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  const titleName = baseName
    ? baseName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : "Template Baru";

  return {
    name: titleName,
    delimiter,
    columns,
    sampleRowCount: dataRows.length,
  };
}

export async function inferFromParquet(
  buffer: ArrayBuffer,
  fileName: string
): Promise<InferredTemplateStructure> {
  const metadata = parquetMetadata(buffer);
  const schema = metadata.schema;

  const records = (await parquetReadObjects({
    file: buffer,
    rowStart: 0,
    rowEnd: 5000,
  })) as Record<string, unknown>[];

  const schemaElements = schema.slice(1);
  const seenNames = new Set<string>();
  const sampleRowCount = records.length;

  const dataColumns: Record<string, unknown[]> = {};
  for (const elem of schemaElements) {
    dataColumns[elem.name] = records.map((row) => row[elem.name]);
  }

  const columns: InferredColumn[] = schemaElements.map((elem) => {
    const originalName = elem.name;
    let { name, renamed } = normalizeColumnName(originalName);
    if (seenNames.has(name)) {
      let counter = 2;
      while (seenNames.has(`${name}_${counter}`)) {
        counter++;
      }
      name = `${name}_${counter}`;
      renamed = true;
    }
    seenNames.add(name);

    const values = dataColumns[originalName] || [];
    const repetitionType = elem.repetition_type;
    const isOptionalSchema = repetitionType === "OPTIONAL";

    const typeStr = String(elem.type || "");
    const convertedTypeStr = String(elem.converted_type || "");

    let inferredType: InferredColumn["type"] = "text";
    let inferredRule: ColumnRule = { type: "text" };
    const required = !isOptionalSchema && values.every((v) => v !== null && v !== undefined && String(v).trim() !== "");

    if (
      convertedTypeStr.includes("INT") ||
      typeStr === "INT32" ||
      typeStr === "INT64"
    ) {
      inferredType = "integer";
      inferredRule = { type: "integer" };
      const nonNullNums = values
        .filter((v) => v !== null && v !== undefined)
        .map((v) => Number(v));
      const observedMin = nonNullNums.length > 0 ? Math.min(...nonNullNums) : undefined;
      const observedMax = nonNullNums.length > 0 ? Math.max(...nonNullNums) : undefined;

      return {
        name,
        originalName,
        renamed,
        required,
        type: inferredType,
        rule: inferredRule,
        observedMin,
        observedMax,
      };
    }

    if (
      typeStr === "FLOAT" ||
      typeStr === "DOUBLE" ||
      convertedTypeStr.includes("DECIMAL")
    ) {
      inferredType = "decimal";
      inferredRule = {
        type: "decimal",
        allowComma: false,
        allowDot: true,
        allowScientific: true,
      };
      return {
        name,
        originalName,
        renamed,
        required,
        type: inferredType,
        rule: inferredRule,
      };
    }

    if (
      convertedTypeStr === "DATE" ||
      convertedTypeStr.includes("TIMESTAMP") ||
      convertedTypeStr.includes("TIME")
    ) {
      inferredType = "date";
      inferredRule = { type: "date", format: "yyyy-MM-dd" };
      return {
        name,
        originalName,
        renamed,
        required,
        type: inferredType,
        rule: inferredRule,
      };
    }

    const strValues = values.map((v) => (v === null || v === undefined ? "" : String(v)));
    const heuristic = inferRuleFromValues(strValues);

    return {
      name,
      originalName,
      renamed,
      required: !isOptionalSchema && heuristic.required,
      type: heuristic.type,
      rule: heuristic.rule,
      suggestedList: heuristic.suggestedList,
      observedMin: heuristic.observedMin,
      observedMax: heuristic.observedMax,
    };
  });

  const baseName = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  const titleName = baseName
    ? baseName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : "Template Baru";

  return {
    name: titleName,
    delimiter: ",",
    columns,
    sampleRowCount,
  };
}
