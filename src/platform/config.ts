import { z } from "zod";
import { getEnv } from "./env";

export function normalizeHost(raw: string): string {
  let url = raw.trim();
  if (!url) return "";
  if (url.startsWith("http://")) {
    url = `https://${url.slice(7)}`;
  } else if (!url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export function hostOnly(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

const requiredText = z.string().trim().min(1);

const DatabricksSchema = z.object({
  DATABRICKS_HOST: requiredText.transform(normalizeHost),
  DATABRICKS_TOKEN: requiredText,
  DATABRICKS_CATALOG: requiredText,
  DATABRICKS_VOLUME_NAME: z.string().trim().optional(),
});

const DatabaseSchema = z.object({
  DATABASE_URL: requiredText,
});

const AdminSchema = z.object({
  ADMIN_PASSWORD: requiredText,
  SESSION_SECRET: z.string().min(32),
});

const positiveInt = (fallback: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : NaN;
      return Number.isInteger(n) && n > 0 ? n : fallback;
    });

const LimitsSchema = z.object({
  MAX_UPLOAD_MB: positiveInt(100),
  MAX_TEMPLATES: positiveInt(50),
  DEPLOY_TARGET: z.string().trim().optional(),
});

export const CONFIG_GROUPS = {
  databricks: ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_CATALOG"],
  database: ["DATABASE_URL"],
  admin: ["ADMIN_PASSWORD", "SESSION_SECRET"],
} as const;

export type ConfigGroup = keyof typeof CONFIG_GROUPS;

export interface DatabricksConfig {
  host: string;
  workspaceHost: string;
  token: string;
  catalog: string;
  volumeName: string;
}

export interface AdminConfig {
  password: string;
  sessionSecret: string;
}

export interface LimitsConfig {
  maxUploadMb: number;
  maxTemplates: number;
  deployTarget: string;
}

function readRaw(keys: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) out[k] = getEnv(k);
  return out;
}

function invalidKeys(error: z.ZodError): string[] {
  return Array.from(new Set(error.issues.map((i) => String(i.path[0]))));
}

const reported = new Set<string>();

function reportMissing(group: string, keys: string[]): void {
  const key = `${group}:${keys.join(",")}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`Konfigurasi ${group} belum lengkap: ${keys.join(", ")}`);
}

export function getDatabricksConfig(): DatabricksConfig | null {
  const parsed = DatabricksSchema.safeParse(
    readRaw([...CONFIG_GROUPS.databricks, "DATABRICKS_VOLUME_NAME"])
  );
  if (!parsed.success) {
    reportMissing("databricks", invalidKeys(parsed.error));
    return null;
  }
  const d = parsed.data;
  const rawVolume = getEnv("DATABRICKS_VOLUME_NAME");
  return {
    host: d.DATABRICKS_HOST,
    workspaceHost: hostOnly(d.DATABRICKS_HOST),
    token: d.DATABRICKS_TOKEN,
    catalog: d.DATABRICKS_CATALOG,
    volumeName: rawVolume === undefined ? "file_storage" : rawVolume.trim(),
  };
}

export function getDatabaseUrlConfig(): string | null {
  const parsed = DatabaseSchema.safeParse(readRaw(CONFIG_GROUPS.database));
  if (!parsed.success) {
    reportMissing("database", invalidKeys(parsed.error));
    return null;
  }
  return parsed.data.DATABASE_URL;
}

export function getAdminConfig(): AdminConfig | null {
  const parsed = AdminSchema.safeParse(readRaw(CONFIG_GROUPS.admin));
  if (!parsed.success) {
    reportMissing("admin", invalidKeys(parsed.error));
    return null;
  }
  return {
    password: parsed.data.ADMIN_PASSWORD,
    sessionSecret: parsed.data.SESSION_SECRET,
  };
}

export function getLimitsConfig(): LimitsConfig {
  const parsed = LimitsSchema.parse(
    readRaw(["MAX_UPLOAD_MB", "MAX_TEMPLATES", "DEPLOY_TARGET"])
  );
  return {
    maxUploadMb: parsed.MAX_UPLOAD_MB,
    maxTemplates: parsed.MAX_TEMPLATES,
    deployTarget: (parsed.DEPLOY_TARGET || "node").toLowerCase(),
  };
}

export function getConfigStatus(): Record<ConfigGroup, boolean> {
  return {
    databricks: getDatabricksConfig() !== null,
    database: getDatabaseUrlConfig() !== null,
    admin: getAdminConfig() !== null,
  };
}
