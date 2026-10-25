import type { TemplateDefinition, ColumnDefinition, ColumnRule } from "./schema";

export interface TemplateDiff {
  changes: string[];
  isBreaking: boolean;
  summary: string;
}

function areRulesEqual(a: ColumnRule, b: ColumnRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isRuleStrict(prev: ColumnRule, next: ColumnRule): boolean {
  if (prev.type !== next.type) {
    return true;
  }

  if (prev.type === "digits" && next.type === "digits") {
    return prev.length !== next.length;
  }

  if (prev.type === "text" && next.type === "text") {
    if (next.minLength !== undefined && (prev.minLength === undefined || next.minLength > prev.minLength)) {
      return true;
    }
    if (next.maxLength !== undefined && (prev.maxLength === undefined || next.maxLength < prev.maxLength)) {
      return true;
    }
    if (next.allowedValues && (!prev.allowedValues || !next.allowedValues.every((val) => prev.allowedValues?.includes(val)))) {
      return true;
    }
  }

  if (prev.type === "integer" && next.type === "integer") {
    if (next.min !== undefined && (prev.min === undefined || next.min > prev.min)) return true;
    if (next.max !== undefined && (prev.max === undefined || next.max < prev.max)) return true;
  }

  if (prev.type === "decimal" && next.type === "decimal") {
    if (next.min !== undefined && (prev.min === undefined || next.min > prev.min)) return true;
    if (next.max !== undefined && (prev.max === undefined || next.max < prev.max)) return true;
    if (prev.allowComma && next.allowComma === false) return true;
    if (prev.allowDot && next.allowDot === false) return true;
    if (prev.allowScientific && next.allowScientific === false) return true;
  }

  if (prev.type === "date" && next.type === "date") {
    if (prev.format !== next.format) return true;
  }

  if (prev.type === "list" && next.type === "list") {
    const prevSet = new Set(prev.values);
    for (const v of next.values) {
      if (!prevSet.has(v)) return true;
    }
    if (next.values.length < prev.values.length) return true;
  }

  return false;
}

export function diffTemplates(
  oldTpl: TemplateDefinition,
  newTpl: TemplateDefinition
): TemplateDiff {
  const changes: string[] = [];
  let isBreaking = false;

  if (oldTpl.delimiter !== newTpl.delimiter) {
    changes.push(`Pemisah kolom diubah dari '${oldTpl.delimiter}' menjadi '${newTpl.delimiter}'`);
    isBreaking = true;
  }

  if (oldTpl.name !== newTpl.name) {
    changes.push(`Nama template diubah dari '${oldTpl.name}' menjadi '${newTpl.name}'`);
  }

  if (oldTpl.description !== newTpl.description) {
    changes.push(`Deskripsi template diperbarui`);
  }

  const oldCols = new Map<string, ColumnDefinition>();
  for (const c of oldTpl.columns) {
    oldCols.set(c.name, c);
  }

  const newCols = new Map<string, ColumnDefinition>();
  for (const c of newTpl.columns) {
    newCols.set(c.name, c);
  }

  for (const [name, col] of newCols) {
    if (!oldCols.has(name)) {
      if (col.required) {
        changes.push(`Kolom wajib baru ditambahkan: '${name}'`);
        isBreaking = true;
      } else {
        changes.push(`Kolom opsional baru ditambahkan: '${name}'`);
      }
    }
  }

  for (const [name] of oldCols) {
    if (!newCols.has(name)) {
      changes.push(`Kolom '${name}' dihapus`);
      isBreaking = true;
    }
  }

  for (const [name, oldCol] of oldCols) {
    const newCol = newCols.get(name);
    if (!newCol) continue;

    if (!oldCol.required && newCol.required) {
      changes.push(`Kolom '${name}' diubah dari opsional menjadi wajib`);
      isBreaking = true;
    } else if (oldCol.required && !newCol.required) {
      changes.push(`Kolom '${name}' diubah dari wajib menjadi opsional`);
    }

    if (!areRulesEqual(oldCol.rule, newCol.rule)) {
      if (oldCol.rule.type !== newCol.rule.type) {
        changes.push(
          `Tipe aturan kolom '${name}' diubah dari '${oldCol.rule.type}' menjadi '${newCol.rule.type}'`
        );
        isBreaking = true;
      } else {
        const strict = isRuleStrict(oldCol.rule, newCol.rule);
        changes.push(`Aturan kolom '${name}' diperbarui`);
        if (strict) {
          isBreaking = true;
        }
      }
    }
  }

  const oldColNames = oldTpl.columns.map((c) => c.name);
  const newColNames = newTpl.columns.map((c) => c.name);
  if (
    oldColNames.length === newColNames.length &&
    oldColNames.some((n, i) => n !== newColNames[i]) &&
    oldColNames.every((n) => newColNames.includes(n))
  ) {
    changes.push("Urutan kolom diubah");
  }

  if (changes.length === 0) {
    return {
      changes: [],
      isBreaking: false,
      summary: "Tidak ada perubahan",
    };
  }

  return {
    changes,
    isBreaking,
    summary: changes.join("; "),
  };
}
