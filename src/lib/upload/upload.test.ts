import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { POST as uploadRoute } from "@/app/api/upload/route";
import { saveSettings } from "@/lib/settings";
import {
  buildDestinationFileName,
  buildVolumePath,
  formatTimestamp,
  getDestinationSubfolder,
  sanitizeFileName,
} from "./filename";

describe("Upload Flow & Forwarding ke Databricks Volume", () => {
  const originalFetch = globalThis.fetch;
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-test-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalDataDir !== undefined) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }
    try {
      await fs.rm(dataDir, { recursive: true, force: true });
    } catch {}
  });

  describe("File Name Builder & Path Sanitization", () => {
    it("membersihkan nama file dari karakter terlarang dan spasi", () => {
      expect(sanitizeFileName("Target Brand Distribution.csv")).toBe(
        "Target_Brand_Distribution.csv"
      );
      expect(sanitizeFileName("file with $pecial #chars!.csv")).toBe(
        "file_with__pecial__chars_.csv"
      );
      expect(sanitizeFileName("simple.parquet")).toBe("simple.parquet");
    });

    it("menghapus path traversal seperti ../.. atau C:\\path\\", () => {
      expect(sanitizeFileName("../../etc/passwd.csv")).toBe("passwd.csv");
      expect(sanitizeFileName("..\\..\\secret\\data.csv")).toBe("data.csv");
      expect(sanitizeFileName("/var/log/upload.csv")).toBe("upload.csv");
    });

    it("memformat timestamp yyyyMMdd-HHmmss secara tepat", () => {
      const fixedDate = new Date("2026-10-21T08:15:30Z");
      const ts = formatTimestamp(fixedDate);
      expect(ts.length).toBe(15);
      expect(ts.includes("-")).toBe(true);
    });

    it("membangun nama file destinasi dengan format yang ditentukan", () => {
      const fixedDate = new Date("2026-10-21T08:15:30Z");
      const name = buildDestinationFileName(
        "hari-besar",
        "data contoh.csv",
        fixedDate
      );
      const ts = formatTimestamp(fixedDate);
      expect(name).toBe(`hari-besar__${ts}.csv`);
    });

    it("memilih subfolder yang tepat berdasarkan ekstensi berkas", () => {
      expect(getDestinationSubfolder("data.csv", "csv_dir", "parquet_dir")).toBe(
        "csv_dir"
      );
      expect(
        getDestinationSubfolder("data.parquet", "csv_dir", "parquet_dir")
      ).toBe("parquet_dir");
    });

    it("membangun path lengkap volume Databricks", () => {
      const volumePath = buildVolumePath(
        "main_cat",
        "sales_schema",
        "raw_volume",
        "csv",
        "file.csv"
      );
      expect(volumePath).toBe(
        "/Volumes/main_cat/sales_schema/raw_volume/csv/file.csv"
      );
    });
  });

  describe("Endpoint Server POST /api/upload", () => {
    const setupValidSettings = async (maxFileSizeMb: number = 5) => {
      await saveSettings({
        workspaceUrl: "https://dbc-test.cloud.databricks.com",
        token: "test-token-valid",
        catalog: "main",
        schema: "sales",
        volume: "file_storage",
        subfolderCsv: "csv",
        subfolderParquet: "parquet",
        maxFileSizeMb,
      });
    };

    it("menolak jika berkas atau templateId tidak disertakan", async () => {
      const formData = new FormData();
      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Berkas dan template wajib disertakan");
    });

    it("menolak berkas jika pengaturan Databricks belum dikonfigurasi", async () => {
      try {
        await fs.rm(dataDir, { recursive: true, force: true });
      } catch {}

      const formData = new FormData();
      formData.append(
        "file",
        new File(["Year;Week;KeteranganHariBesar\r\n2026;1;Libur\r\n"], "test.csv")
      );
      formData.append("templateId", "hari-besar");

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Pengaturan Databricks belum dikonfigurasi");
    });

    it("meneruskan byte berkas yang valid ke Volume tanpa perubahan", async () => {
      await setupValidSettings();

      const samplePath = path.join(
        process.cwd(),
        "samples",
        "Hari Besar Contoh.csv"
      );
      const originalBytes = await fs.readFile(samplePath);

      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody: Uint8Array | null = null;

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = init?.method || "";
        if (init?.body instanceof Uint8Array) {
          capturedBody = init.body;
        }
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const formData = new FormData();
      formData.append(
        "file",
        new File([originalBytes], "Hari Besar Contoh.csv")
      );
      formData.append("templateId", "hari-besar");

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.path).toContain(
        "/Volumes/main/sales/file_storage/csv/hari-besar__"
      );
      expect(data.size).toBe(originalBytes.length);

      expect(capturedMethod).toBe("PUT");
      expect(capturedUrl).toContain("/api/2.0/fs/files/Volumes/main/sales/file_storage/csv/");
      expect(capturedBody).not.toBeNull();
      if (capturedBody) {
        expect(Buffer.compare(Buffer.from(capturedBody), originalBytes)).toBe(0);
      }
    });

    it("menolak berkas yang tidak lolos validasi dengan daftar error", async () => {
      await setupValidSettings();

      const invalidContent =
        "Year;Week;KeteranganHariBesar\r\n2026;999;Tahun baru\r\n";
      const formData = new FormData();
      formData.append(
        "file",
        new File([invalidContent], "Hari Besar Contoh.csv")
      );
      formData.append("templateId", "hari-besar");

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(422);

      const data = await response.json();
      expect(data.error).toBe("Validasi berkas gagal");
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it("menolak berkas Parquet untuk template yang hanya mengizinkan CSV", async () => {
      await setupValidSettings();

      const fakeParquet = new Uint8Array([
        0x50, 0x41, 0x52, 0x31,
        0, 0, 0, 0,
        0x50, 0x41, 0x52, 0x31,
      ]);

      const formData = new FormData();
      formData.append("file", new File([fakeParquet], "data.parquet"));
      formData.append("templateId", "hari-besar");

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe(
        "Format Parquet hanya diizinkan untuk template Data Research"
      );
    });

    it("menolak berkas yang melebihi batas ukuran pengaturan", async () => {
      await setupValidSettings(1);

      const largeContent = "a".repeat(2 * 1024 * 1024);
      const formData = new FormData();
      formData.append("file", new File([largeContent], "data.csv"));
      formData.append("templateId", "hari-besar");

      const request = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadRoute(request);
      expect(response.status).toBe(422);

      const data = await response.json();
      expect(
        data.errors.some((e: { code: string }) => e.code === "FILE_TOO_LARGE")
      ).toBe(true);
    });
  });
});
