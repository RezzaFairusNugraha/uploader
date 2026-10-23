export type Rule =
  | { type: "digits"; length: number }
  | { type: "integerRange"; min: number; max: number }
  | { type: "integer"; min?: number; max?: number }
  | { type: "text"; minLength?: number; maxLength?: number; allowedValues?: string[] }
  | {
      type: "decimal";
      min?: number;
      max?: number;
      allowComma?: boolean;
      allowDot?: boolean;
      allowScientific?: boolean;
      allowedText?: string[];
    }
  | {
      type: "numericOrText";
      min?: number;
      allowedText: string[];
    }
  | {
      type: "date";
      format: "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy" | "dd-MM-yyyy" | "yyyy/MM/dd";
    }
  | {
      type: "list";
      values: string[];
    }
  | { type: "anyValue" };

export interface ColumnDefinitionCompat {
  name: string;
  label?: string;
  required: boolean;
  rule: Rule;
}

export interface TemplateConfigCompat {
  id: string;
  name: string;
  slug?: string;
  description: string;
  kind?: "csv" | "csv-or-parquet";
  delimiter: string;
  fileNamePrefix?: string;
  volume?: {
    catalog: string;
    schema: string;
    name: string;
  };
  columns: ColumnDefinitionCompat[];
  exampleRows?: string[][];
}
