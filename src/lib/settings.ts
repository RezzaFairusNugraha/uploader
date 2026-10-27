import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb, withDbRetry } from "@/db";
import { appSettings } from "@/db/schema";
import { getEnv } from "@/platform/env";

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

export interface DecryptedSettings {
  workspaceUrl: string;
  token: string;
  catalog: string;
  schema: string;
  volume?: string;
  subfolderCsv?: string;
  subfolderParquet?: string;
  maxFileSizeMb: number;
  adminPasswordHash?: string | null;
  lastTestResult?: ConnectionTestResult;
}

export interface MaskedSettings {
  configured: boolean;
  workspaceUrl: string;
  hasToken: boolean;
  tokenMasked: string;
  catalog: string;
  schema: string;
  volume?: string;
  subfolderCsv?: string;
  subfolderParquet?: string;
  maxFileSizeMb: number;
  hasAdminPassword?: boolean;
  lastTestResult?: ConnectionTestResult;
}

export function getEncryptionKey(): Buffer {
  const envKey = getEnv("ENCRYPTION_KEY");
  if (!envKey) {
    throw new Error(
      "ENCRYPTION_KEY belum dikonfigurasi. Hubungi administrator untuk mengisi kunci enkripsi (32 byte base64)."
    );
  }
  const buf = Buffer.from(envKey, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY tidak valid. Kunci harus memiliki panjang tepat 32 byte dalam format base64."
    );
  }
  return buf;
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

export function serializeEncryptedData(enc: EncryptedData): string {
  return `${enc.iv}:${enc.tag}:${enc.data}`;
}

export function deserializeEncryptedData(str: string): EncryptedData {
  const parts = str.split(":");
  if (parts.length === 3) {
    return { iv: parts[0], tag: parts[1], data: parts[2] };
  }
  return JSON.parse(str);
}

export const settingsFormSchema = z.object({
  workspaceUrl: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? normalizeUrl(val) : ""))
    .refine((val) => {
      if (!val) return true;
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
    .optional()
    .refine((val) => !val || isValidPathSegment(val), "Katalog tidak boleh mengandung '/', '\\', atau '..'"),
  schema: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || isValidPathSegment(val), "Skema tidak boleh mengandung '/', '\\', atau '..'"),
  volume: z.string().trim().optional(),
  subfolderCsv: z.string().trim().optional(),
  subfolderParquet: z.string().trim().optional(),
  maxFileSizeMb: z.coerce
    .number()
    .int("Batas ukuran file harus berupa bilangan bulat")
    .positive("Batas ukuran file harus lebih besar dari 0")
    .default(100)
    .optional(),
  adminPasswordHash: z.string().optional(),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;

export type MissingConnectionField = "alamat" | "token" | "catalog" | "schema";

export interface ConnectionState {
  ready: boolean;
  missing: MissingConnectionField[];
  error: "database_tidak_terjangkau" | null;
}

export async function getConnectionState(): Promise<ConnectionState> {
  let settings: DecryptedSettings | null = null;
  try {
    settings = await readDecryptedSettings();
  } catch {
    return {
      ready: false,
      missing: [],
      error: "database_tidak_terjangkau",
    };
  }

  if (!settings) {
    return {
      ready: false,
      missing: ["alamat", "token", "catalog", "schema"],
      error: null,
    };
  }

  const missing: MissingConnectionField[] = [];
  if (!settings.workspaceUrl || !settings.workspaceUrl.trim()) {
    missing.push("alamat");
  }
  if (!settings.token || !settings.token.trim()) {
    missing.push("token");
  }
  if (!settings.catalog || !settings.catalog.trim()) {
    missing.push("catalog");
  }
  if (!settings.schema || !settings.schema.trim()) {
    missing.push("schema");
  }

  return {
    ready: missing.length === 0,
    missing,
    error: null,
  };
}

export interface SettingsStore {
  readDecrypted(): Promise<DecryptedSettings | null>;
  readMasked(): Promise<MaskedSettings | null>;
  save(input: SettingsFormData): Promise<MaskedSettings>;
  saveTestResult(result: ConnectionTestResult): Promise<void>;
}

export class DrizzleSettingsStore implements SettingsStore {
  private lastTestResultMemory?: ConnectionTestResult;

  async readDecrypted(): Promise<DecryptedSettings | null> {
    try {
      const db = createDb();
      const rows = await withDbRetry(() =>
        db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1)
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const key = getEncryptionKey();
      const encData = deserializeEncryptedData(row.tokenEncrypted);
      const token = decryptToken(encData, key);

      return {
        workspaceUrl: row.workspaceUrl,
        token,
        catalog: row.catalog,
        schema: row.schema,
        maxFileSizeMb: row.maxUploadMb,
        adminPasswordHash: row.adminPasswordHash,
        lastTestResult: this.lastTestResultMemory,
      };
    } catch {
      return null;
    }
  }

  async readMasked(): Promise<MaskedSettings | null> {
    const decrypted = await this.readDecrypted();
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
      maxFileSizeMb: decrypted.maxFileSizeMb,
      hasAdminPassword: Boolean(decrypted.adminPasswordHash),
      lastTestResult: decrypted.lastTestResult,
    };
  }

  async save(input: SettingsFormData): Promise<MaskedSettings> {
    const existing = await this.readDecrypted();
    const key = getEncryptionKey();

    const workspaceUrlRaw = input.workspaceUrl !== undefined ? input.workspaceUrl : existing?.workspaceUrl || "";
    const normalizedWorkspaceUrl = workspaceUrlRaw ? normalizeUrl(workspaceUrlRaw) : "";

    const catalog = input.catalog !== undefined ? input.catalog.trim() : existing?.catalog || "";
    const schema = input.schema !== undefined ? input.schema.trim() : existing?.schema || "";
    const maxUploadMb = input.maxFileSizeMb !== undefined ? input.maxFileSizeMb : existing?.maxFileSizeMb || 100;

    let tokenToEncrypt = input.token !== undefined && input.token.trim() !== "" ? input.token.trim() : existing?.token || "";
    if (!tokenToEncrypt && !existing?.token) {
      tokenToEncrypt = "";
    }

    const encrypted = tokenToEncrypt ? encryptToken(tokenToEncrypt, key) : null;
    const serializedToken = encrypted ? serializeEncryptedData(encrypted) : "";
    const db = createDb();

    const adminHash = input.adminPasswordHash ?? existing?.adminPasswordHash ?? null;

    await withDbRetry(() =>
      db
        .insert(appSettings)
        .values({
          id: 1,
          workspaceUrl: normalizedWorkspaceUrl,
          tokenEncrypted: serializedToken,
          catalog,
          schema,
          maxUploadMb,
          adminPasswordHash: adminHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: {
            workspaceUrl: normalizedWorkspaceUrl,
            tokenEncrypted: serializedToken,
            catalog,
            schema,
            maxUploadMb,
            adminPasswordHash: adminHash,
            updatedAt: new Date(),
          },
        })
    );

    return {
      configured: Boolean(normalizedWorkspaceUrl && tokenToEncrypt && catalog && schema),
      workspaceUrl: normalizedWorkspaceUrl,
      hasToken: Boolean(tokenToEncrypt),
      tokenMasked: tokenToEncrypt ? maskToken(tokenToEncrypt) : "",
      catalog,
      schema,
      maxFileSizeMb: maxUploadMb,
      hasAdminPassword: Boolean(adminHash),
      lastTestResult: this.lastTestResultMemory,
    };
  }

  async saveTestResult(result: ConnectionTestResult): Promise<void> {
    this.lastTestResultMemory = result;
  }
}

export class FakeInMemorySettingsStore implements SettingsStore {
  private stored: {
    workspaceUrl: string;
    tokenEncrypted: EncryptedData;
    catalog: string;
    schema: string;
    maxUploadMb: number;
    lastTestResult?: ConnectionTestResult;
  } | null = null;

  private customKey?: Buffer;

  constructor(customKey?: Buffer) {
    this.customKey = customKey;
  }

  private getKey(): Buffer {
    if (this.customKey) return this.customKey;
    return getEncryptionKey();
  }

  async readDecrypted(): Promise<DecryptedSettings | null> {
    if (!this.stored) return null;
    const token = decryptToken(this.stored.tokenEncrypted, this.getKey());
    return {
      workspaceUrl: this.stored.workspaceUrl,
      token,
      catalog: this.stored.catalog,
      schema: this.stored.schema,
      maxFileSizeMb: this.stored.maxUploadMb,
      lastTestResult: this.stored.lastTestResult,
    };
  }

  async readMasked(): Promise<MaskedSettings | null> {
    const decrypted = await this.readDecrypted();
    if (!decrypted) return null;
    return {
      configured: true,
      workspaceUrl: decrypted.workspaceUrl,
      hasToken: Boolean(decrypted.token),
      tokenMasked: maskToken(decrypted.token),
      catalog: decrypted.catalog,
      schema: decrypted.schema,
      maxFileSizeMb: decrypted.maxFileSizeMb,
      hasAdminPassword: Boolean(decrypted.adminPasswordHash),
      lastTestResult: decrypted.lastTestResult,
    };
  }

  async save(input: SettingsFormData): Promise<MaskedSettings> {
    const existing = await this.readDecrypted();
    const workspaceUrlRaw = input.workspaceUrl !== undefined ? input.workspaceUrl : existing?.workspaceUrl || "";
    const normalizedWorkspaceUrl = workspaceUrlRaw ? normalizeUrl(workspaceUrlRaw) : "";

    const catalog = input.catalog !== undefined ? input.catalog.trim() : existing?.catalog || "";
    const schema = input.schema !== undefined ? input.schema.trim() : existing?.schema || "";
    const maxUploadMb = input.maxFileSizeMb !== undefined ? input.maxFileSizeMb : existing?.maxFileSizeMb || 100;

    let token = input.token !== undefined && input.token.trim() !== "" ? input.token.trim() : existing?.token || "";
    if (!token && !existing?.token) {
      token = "";
    }

    const tokenEncrypted = token ? encryptToken(token, this.getKey()) : { iv: "", tag: "", data: "" };
    this.stored = {
      workspaceUrl: normalizedWorkspaceUrl,
      tokenEncrypted,
      catalog,
      schema,
      maxUploadMb,
      lastTestResult: this.stored?.lastTestResult,
    };

    return (await this.readMasked())!;
  }

  async saveTestResult(result: ConnectionTestResult): Promise<void> {
    if (this.stored) {
      this.stored.lastTestResult = result;
    }
  }
}

let activeStore: SettingsStore = new DrizzleSettingsStore();

export function setSettingsStore(store: SettingsStore): void {
  activeStore = store;
}

export function getSettingsStore(): SettingsStore {
  return activeStore;
}

export async function readDecryptedSettings(): Promise<DecryptedSettings | null> {
  return getSettingsStore().readDecrypted();
}

export async function readMaskedSettings(): Promise<MaskedSettings | null> {
  return getSettingsStore().readMasked();
}

export async function saveSettings(input: SettingsFormData): Promise<MaskedSettings> {
  return getSettingsStore().save(input);
}

export async function saveTestResult(result: ConnectionTestResult): Promise<void> {
  return getSettingsStore().saveTestResult(result);
}
