export interface ValidationInput {
  name: string;
  size: number;
  bytes: Uint8Array;
}

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  line?: number;
  column?: string;
  value?: string;
  message: string;
}

export interface ValidationSummary {
  rowCount: number;
  columnCount: number;
  detectedDelimiter: string;
  issueCounts: Record<string, number>;
  totalErrors: number;
  totalWarnings: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: ValidationSummary;
}

export interface ValidationOptions {
  maxFileSizeMb?: number;
}
