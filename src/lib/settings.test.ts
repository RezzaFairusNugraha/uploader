import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  decryptToken,
  encryptToken,
  isValidPathSegment,
  maskToken,
  normalizeUrl,
  readDecryptedSettings,
  readMaskedSettings,
  readRawSettings,
  saveSettings,
  saveTestResult,
} from "./settings";

describe("Settings & Encryption", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uploader-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("URL Normalizer", () => {
    it("menghapus spasi dan trailing slash serta menambahkan https://", () => {
      expect(normalizeUrl("  dbc-xxxx.cloud.databricks.com/ ")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("http://dbc-xxxx.cloud.databricks.com///")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("https://dbc-xxxx.cloud.databricks.com/")).toBe(
        "https://dbc-xxxx.cloud.databricks.com"
      );
      expect(normalizeUrl("")).toBe("");
    });
  });

  describe("Validasi Segmen Path", () => {
    it("menerima segmen yang valid dan menolak karakter terlarang", () => {
      expect(isValidPathSegment("databricks_catalog")).toBe(true);
      expect(isValidPathSegment("csv")).toBe(true);
      expect(isValidPathSegment("volume-1")).toBe(true);

      expect(isValidPathSegment("folder/subfolder")).toBe(false);
      expect(isValidPathSegment("..")).toBe(false);
      expect(isValidPathSegment("folder\\subfolder")).toBe(false);
      expect(isValidPathSegment("")).toBe(false);
      expect(isValidPathSegment("   ")).toBe(false);
    });
  });

  describe("Masking Token", () => {
    it("menampilkan titik masker dengan 4 karakter terakhir", () => {
      const masked = maskToken("test-token-not-real");
      expect(masked.endsWith("real")).toBe(true);
      expect(masked.startsWith("••••••••••••")).toBe(true);
      expect(masked.includes("test-token")).toBe(false);

      expect(maskToken("abcd")).toBe("••••");
      expect(maskToken("")).toBe("");
    });
  });

  describe("Enkripsi AES-256-GCM", () => {
    const fakeToken = "test-token-not-real";

    it("melakukan round-trip enkripsi dan dekripsi dengan benar", () => {
      const key = crypto.randomBytes(32);
      const encrypted = encryptToken(fakeToken, key);

      expect(encrypted.data).not.toBe(fakeToken);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = decryptToken(encrypted, key);
      expect(decrypted).toBe(fakeToken);
    });

    it("gagal mendeskripsi jika kunci salah", () => {
      const key1 = crypto.randomBytes(32);
      const key2 = crypto.randomBytes(32);
      const encrypted = encryptToken(fakeToken, key1);

      expect(() => decryptToken(encrypted, key2)).toThrow();
    });

    it("gagal mendeskripsi jika tag otentikasi dimanipulasi", () => {
      const key = crypto.randomBytes(32);
      const encrypted = encryptToken(fakeToken, key);
      const tampered = {
        ...encrypted,
        tag: crypto.randomBytes(16).toString("hex"),
      };

      expect(() => decryptToken(tampered, key)).toThrow();
    });
  });

  describe("Penyimpanan Pengaturan dalam Direktori Sementara", () => {
    it("mengembalikan null jika belum ada pengaturan yang disimpan", async () => {
      const raw = await readRawSettings(tempDir);
      const masked = await readMaskedSettings(tempDir);
      expect(raw).toBeNull();
      expect(masked).toBeNull();
    });

    it("membuat .key dan settings.json saat menyimpan pertama kali", async () => {
      const fakeToken = "test-token-not-real";
      const saved = await saveSettings(
        {
          workspaceUrl: "dbc-1234.cloud.databricks.com",
          token: fakeToken,
          catalog: "main",
          schema: "sales",
          volume: "raw_files",
          subfolderCsv: "csv",
          subfolderParquet: "parquet",
          maxFileSizeMb: 50,
        },
        tempDir
      );

      expect(saved.configured).toBe(true);
      expect(saved.workspaceUrl).toBe("https://dbc-1234.cloud.databricks.com");
      expect(saved.hasToken).toBe(true);
      expect(saved.tokenMasked.endsWith("real")).toBe(true);
      expect((saved as unknown as { token?: string }).token).toBeUndefined();

      const keyExists = await fs
        .stat(path.join(tempDir, ".key"))
        .then(() => true)
        .catch(() => false);
      expect(keyExists).toBe(true);

      const decrypted = await readDecryptedSettings(tempDir);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.token).toBe(fakeToken);
    });

    it("dapat memperbarui pengaturan tanpa mengisi ulang token", async () => {
      const fakeToken = "test-token-not-real";
      await saveSettings(
        {
          workspaceUrl: "https://dbc-1234.cloud.databricks.com",
          token: fakeToken,
          catalog: "main",
          schema: "sales",
          volume: "raw_files",
          subfolderCsv: "csv",
          subfolderParquet: "parquet",
          maxFileSizeMb: 100,
        },
        tempDir
      );

      await saveSettings(
        {
          workspaceUrl: "https://dbc-1234.cloud.databricks.com",
          catalog: "main_updated",
          schema: "sales",
          volume: "raw_files",
          subfolderCsv: "csv_inbox",
          subfolderParquet: "parquet",
          maxFileSizeMb: 200,
        },
        tempDir
      );

      const updated = await readDecryptedSettings(tempDir);
      expect(updated?.catalog).toBe("main_updated");
      expect(updated?.subfolderCsv).toBe("csv_inbox");
      expect(updated?.maxFileSizeMb).toBe(200);
      expect(updated?.token).toBe(fakeToken);
    });

    it("dapat menyimpan dan memperbarui hasil uji koneksi", async () => {
      await saveSettings(
        {
          workspaceUrl: "https://dbc-1234.cloud.databricks.com",
          token: "test-token-not-real",
          catalog: "main",
          schema: "sales",
          volume: "raw_files",
          subfolderCsv: "csv",
          subfolderParquet: "parquet",
          maxFileSizeMb: 100,
        },
        tempDir
      );

      const testResult = {
        success: true,
        testedAt: new Date().toISOString(),
        steps: [
          { name: "Host dapat dijangkau dan token valid", success: true },
          { name: "Direktori Volume utama ditemukan", success: true },
          { name: "Subfolder CSV ditemukan", success: true },
          { name: "Subfolder Parquet ditemukan", success: true },
        ],
      };

      await saveTestResult(testResult, tempDir);
      const stored = await readRawSettings(tempDir);
      expect(stored?.lastTestResult?.success).toBe(true);
      expect(stored?.lastTestResult?.steps.length).toBe(4);
    });
  });
});
