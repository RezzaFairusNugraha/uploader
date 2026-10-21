import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export interface EncryptedData {
  iv: string;
  tag: string;
  data: string;
}

export interface TestStepResult {
  name: string;
  success: boolean;
  message?: string;
  fix?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  testedAt: string;
  steps: TestStepResult[];
}

export interface StoredSettings {
  workspaceUrl: string;
  tokenEncrypted: EncryptedData;
  catalog: string;
  schema: string;
  volume: string;
  subfolderCsv: string;
  subfolderParquet: string;
  maxFileSizeMb: number;
  lastTestResult?: ConnectionTestResult;
}

export interface DecryptedSettings {
  workspaceUrl: string;
  token: string;
  catalog: string;
  schema: string;
  volume: string;
  subfolderCsv: string;
  subfolderParquet: string;
  maxFileSizeMb: number;
  lastTestResult?: ConnectionTestResult;
}

export interface MaskedSettings {
  configured: boolean;
  workspaceUrl: string;
  hasToken: boolean;
  tokenMasked: string;
  catalog: string;
  schema: string;
  volume: string;
  subfolderCsv: string;
  subfolderParquet: string;
  maxFileSizeMb: number;
  lastTestResult?: ConnectionTestResult;
}

export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) {
    return "";
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  } else if (url.startsWith("http://")) {
    url = `https://${url.slice(7)}`;
  }
  return url.replace(/\/+$/, "");
}

export function isValidPathSegment(segment: string): boolean {
  if (!segment || typeof segment !== "string") {
    return false;
  }
  const trimmed = segment.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.includes("/") || trimmed.includes("..") || trimmed.includes("\\")) {
    return false;
  }
  return true;
}

export function maskToken(token: string): string {
  if (!token) {
    return "";
  }
  if (token.length <= 4) {
    return "••••";
  }
  const lastFour = token.slice(-4);
  return `${"•".repeat(12)}${lastFour}`;
}

export function encryptToken(token: string, key: Buffer): EncryptedData {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

export function decryptToken(encrypted: EncryptedData, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, "hex");
  const tag = Buffer.from(encrypted.tag, "hex");
  const data = Buffer.from(encrypted.data, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

function getDefaultDataDir(): string {
  return path.join(process.cwd(), "data");
}

export async function getOrCreateKey(customDir?: string): Promise<Buffer> {
  const dataDir = customDir || getDefaultDataDir();
  const keyPath = path.join(dataDir, ".key");

  try {
    const existing = await fs.readFile(keyPath);
    if (existing.length === 32) {
      return existing;
    }
  } catch {}

  await fs.mkdir(dataDir, { recursive: true });
  const newKey = crypto.randomBytes(32);
  await fs.writeFile(keyPath, newKey, { mode: 0o600 });
  return newKey;
}

export async function readRawSettings(
  customDir?: string
): Promise<StoredSettings | null> {
  const dataDir = customDir || getDefaultDataDir();
  const settingsPath = path.join(dataDir, "settings.json");

  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    return JSON.parse(raw) as StoredSettings;
  } catch {
    return null;
  }
}

export async function readDecryptedSettings(
  customDir?: string
): Promise<DecryptedSettings | null> {
  const stored = await readRawSettings(customDir);
  if (!stored) {
    return null;
  }

  const key = await getOrCreateKey(customDir);
  const token = decryptToken(stored.tokenEncrypted, key);

  return {
    workspaceUrl: stored.workspaceUrl,
    token,
    catalog: stored.catalog,
    schema: stored.schema,
    volume: stored.volume,
    subfolderCsv: stored.subfolderCsv,
    subfolderParquet: stored.subfolderParquet,
    maxFileSizeMb: stored.maxFileSizeMb,
    lastTestResult: stored.lastTestResult,
  };
}

export async function readMaskedSettings(
  customDir?: string
): Promise<MaskedSettings | null> {
  const decrypted = await readDecryptedSettings(customDir);
  if (!decrypted) {
    return null;
  }

  return {
    configured: true,
    workspaceUrl: decrypted.workspaceUrl,
    hasToken: Boolean(decrypted.token),
    tokenMasked: maskToken(decrypted.token),
    catalog: decrypted.catalog,
    schema: decrypted.schema,
    volume: decrypted.volume,
    subfolderCsv: decrypted.subfolderCsv,
    subfolderParquet: decrypted.subfolderParquet,
    maxFileSizeMb: decrypted.maxFileSizeMb,
    lastTestResult: decrypted.lastTestResult,
  };
}

export const settingsFormSchema = z.object({
  workspaceUrl: z
    .string()
    .trim()
    .min(1, "URL workspace wajib diisi")
    .transform(normalizeUrl)
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "https:" && Boolean(parsed.hostname);
      } catch {
        return false;
      }
    }, "Format URL workspace tidak valid"),
  token: z.string().trim().optional(),
  catalog: z
    .string()
    .trim()
    .min(1, "Katalog wajib diisi")
    .refine(isValidPathSegment, "Katalog tidak boleh mengandung '/', '\\', atau '..'"),
  schema: z
    .string()
    .trim()
    .min(1, "Skema wajib diisi")
    .refine(isValidPathSegment, "Skema tidak boleh mengandung '/', '\\', atau '..'"),
  volume: z
    .string()
    .trim()
    .min(1, "Volume wajib diisi")
    .refine(isValidPathSegment, "Volume tidak boleh mengandung '/', '\\', atau '..'"),
  subfolderCsv: z
    .string()
    .trim()
    .default("csv")
    .refine(isValidPathSegment, "Subfolder CSV tidak boleh mengandung '/', '\\', atau '..'"),
  subfolderParquet: z
    .string()
    .trim()
    .default("parquet")
    .refine(isValidPathSegment, "Subfolder Parquet tidak boleh mengandung '/', '\\', atau '..'"),
  maxFileSizeMb: z.coerce
    .number()
    .int("Batas ukuran file harus berupa bilangan bulat")
    .positive("Batas ukuran file harus lebih besar dari 0")
    .default(100),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;

export async function saveSettings(
  input: SettingsFormData,
  customDir?: string
): Promise<MaskedSettings> {
  const dataDir = customDir || getDefaultDataDir();
  const existing = await readRawSettings(dataDir);
  const key = await getOrCreateKey(dataDir);
  const normalizedWorkspaceUrl = normalizeUrl(input.workspaceUrl);

  let tokenToEncrypt = input.token?.trim() || "";
  if (!tokenToEncrypt) {
    if (existing) {
      tokenToEncrypt = decryptToken(existing.tokenEncrypted, key);
    } else {
      throw new Error("Personal Access Token wajib diisi");
    }
  }

  const tokenEncrypted = encryptToken(tokenToEncrypt, key);
  const stored: StoredSettings = {
    workspaceUrl: normalizedWorkspaceUrl,
    tokenEncrypted,
    catalog: input.catalog,
    schema: input.schema,
    volume: input.volume,
    subfolderCsv: input.subfolderCsv || "csv",
    subfolderParquet: input.subfolderParquet || "parquet",
    maxFileSizeMb: input.maxFileSizeMb || 100,
    lastTestResult: existing?.lastTestResult,
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "settings.json"),
    JSON.stringify(stored, null, 2),
    "utf8"
  );

  return {
    configured: true,
    workspaceUrl: stored.workspaceUrl,
    hasToken: true,
    tokenMasked: maskToken(tokenToEncrypt),
    catalog: stored.catalog,
    schema: stored.schema,
    volume: stored.volume,
    subfolderCsv: stored.subfolderCsv,
    subfolderParquet: stored.subfolderParquet,
    maxFileSizeMb: stored.maxFileSizeMb,
    lastTestResult: stored.lastTestResult,
  };
}

export async function saveTestResult(
  result: ConnectionTestResult,
  customDir?: string
): Promise<void> {
  const dataDir = customDir || getDefaultDataDir();
  const existing = await readRawSettings(dataDir);
  if (!existing) {
    return;
  }

  existing.lastTestResult = result;
  await fs.writeFile(
    path.join(dataDir, "settings.json"),
    JSON.stringify(existing, null, 2),
    "utf8"
  );
}
